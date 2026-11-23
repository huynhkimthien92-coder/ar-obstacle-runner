// Biến landmark thành "input game": làn (0/1/2), đang nhảy, đang ngồi, giơ tay, khoảng cách.
// Thuần logic, không đụng DOM → test được bằng Node (tests/motion.test.mjs).
//
// Hai kiểu khung người:
//   'full' — toàn thân (chơi trên TV, đứng 2,5–3 m): nhắc khoảng cách theo chiều cao đầu→chân
//   'near' — nửa người (chơi trên màn hình điện thoại, đứng 1–1,5 m): chỉ cần đầu→hông, nhắc theo bề rộng vai
// Cả hai đều chỉ BẮT BUỘC thấy 2 vai; hông khuất thì suy ra từ vai → ít mất dấu hơn.
import { CONFIG } from './config.js';
import { LM } from './pose.js';

const vis = (p, m) => !!p && p.v >= m;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const median = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

export class MotionTracker {
  constructor(cfg = CONFIG.MOTION) {
    this.cfg = cfg;
    this.videoPortrait = true; // để ước lượng mét (FOV khác nhau theo hướng khung hình)
    this.mode = 'full';
    this.reset();
  }

  reset() {
    this.base = null; this.calib = []; this.calibrating = false;
    this.airSince = 0; this.duckSince = 0; this.prevAnchorY = null; this.lastSeen = -1e9;
    this.rebase = null; // {until, samples[]} — cửa sổ lấy lại baseline sau khi người chơi quay lại / đổi chỗ đột ngột
    this.state = {
      present: false, coasting: false, fullBody: false, hipsSeen: false, calibrated: false, calibProgress: 0,
      lane: 1, laneX: 0.5, airborne: false, ducking: false, handsUp: false, oneHandUp: false,
      rise: 0, drop: 0, distance: { hint: 'none', bodyFrac: 0, shoulderFrac: 0, meters: null },
    };
  }

  /** keepBase=true: hiệu chỉnh lại nhanh (lúc đếm ngược) nhưng giữ baseline cũ cho tới khi có cái mới. */
  beginCalibration(keepBase = false) {
    this.calibrating = true; this.calib = []; this.state.calibProgress = 0;
    if (!keepBase) this.base = null;
  }
  /** main.js tắt cổng này khi người chơi chưa đứng đúng khoảng cách (đang đi lùi) để không lấy mẫu sai. */
  calibGate = true;
  get calibrated() { return !!this.base; }

  /**
   * @param pts  landmark đã đổi sang pixel màn hình (đã lật gương nếu camera trước)
   * @param raw  landmark chuẩn hoá gốc của video (0..1) — dùng cho ước lượng khoảng cách
   * @param W,H  kích thước khung vẽ (px)
   * @param t    thời gian ms
   */
  update(pts, raw, W, H, t) {
    const c = this.cfg, s = this.state;
    if (!pts || !raw) return this._lost(t);
    const ls = pts[LM.L_SH], rs = pts[LM.R_SH], lh = pts[LM.L_HIP], rh = pts[LM.R_HIP];
    if (!vis(ls, c.shoulderVis) || !vis(rs, c.shoulderVis)) return this._lost(t);
    const wasGone = !s.present;
    s.present = true; s.coasting = false; this.lastSeen = t;

    const sh = mid(ls, rs);
    const shW = Math.max(1, Math.hypot(ls.x - rs.x, ls.y - rs.y));
    const hipsOk = vis(lh, c.visMin) && vis(rh, c.visMin) && lh.y < H * 1.02 && rh.y < H * 1.02;
    s.hipsSeen = hipsOk;
    // Hông khuất (đứng gần / mép khung) → ước lượng hông từ vai, thân ≈ 1.4 × bề rộng vai
    const torso = hipsOk ? Math.max(1, mid(lh, rh).y - sh.y) : shW * c.torsoPerShoulder;
    const hip = hipsOk ? mid(lh, rh) : { x: sh.x, y: sh.y + torso };

    this._distance(raw);

    // --- Làn: vị trí thân theo bề ngang khung, có trễ để không rung giữa 2 làn ---
    s.laneX = Math.min(1, Math.max(0, (hipsOk ? hip.x * 0.6 + sh.x * 0.4 : sh.x) / W));
    const h = c.laneHyst, x = s.laneX;
    if (s.lane === 0 && x > 1 / 3 + h) s.lane = x > 2 / 3 + h ? 2 : 1;
    else if (s.lane === 2 && x < 2 / 3 - h) s.lane = x < 1 / 3 - h ? 0 : 1;
    else if (s.lane === 1) { if (x < 1 / 3 - h) s.lane = 0; else if (x > 2 / 3 + h) s.lane = 2; }

    // --- Giơ tay: cổ tay cao hơn mũi (nếu không thấy mũi thì cao hơn vai một đoạn) ---
    const n = pts[LM.NOSE], lw = pts[LM.L_WR], rw = pts[LM.R_WR];
    const headY = vis(n, 0.4) ? n.y : sh.y - shW * 0.8;
    const lUp = vis(lw, 0.35) && lw.y < headY, rUp = vis(rw, 0.35) && rw.y < headY;
    s.handsUp = lUp && rUp; s.oneHandUp = lUp || rUp;

    // Mốc dọc để đo nhảy: hông khi thấy hông, không thì vai
    const anchorY = hipsOk ? hip.y : sh.y;

    // --- Hiệu chỉnh: lấy trung vị khi người đứng yên ---
    if (this.calibrating && this.calibGate) {
      const stable = this.prevAnchorY !== null && Math.abs(anchorY - this.prevAnchorY) / torso < 0.03;
      if (stable) this.calib.push({ hipY: hip.y, shY: sh.y, torso, t });
      if (this.calib.length > 3 && Math.abs(hip.y - median(this.calib.map(k => k.hipY))) / torso > 0.12) this.calib = [];
      const span = this.calib.length ? t - this.calib[0].t : 0;
      s.calibProgress = Math.min(1, span / c.calibMs, this.calib.length / c.calibSamples);
      if (span >= c.calibMs && this.calib.length >= c.calibSamples) {
        this.base = {
          hipY: median(this.calib.map(k => k.hipY)),
          shY: median(this.calib.map(k => k.shY)),
          torso: median(this.calib.map(k => k.torso)),
          shW: 0,
        };
        this.calibrating = false; this.rebase = null;
      }
    }
    this.prevAnchorY = anchorY;
    s.calibrated = !!this.base;
    if (!this.base) return s;

    // --- Nhận diện lại: quay vào khung sau khi mất dấu, hoặc bề rộng vai đổi đột ngột >25% (đổi chỗ / người khác bước vào)
    //     → KHÔNG so với tư thế cũ; lấy lại baseline từ vài khung đầu để không báo nhảy/ngồi nhầm.
    const b = this.base;
    if (!this.rebase && (wasGone || (b.shW && Math.abs(shW - b.shW) / b.shW > c.rebaseShoulderJump))) {
      this.rebase = { until: t + c.rebaseMs, samples: [] };
    }
    if (this.rebase) {
      this.rebase.samples.push({ hipY: hip.y, shY: sh.y, torso, shW });
      s.airborne = s.ducking = false; s.rise = s.drop = 0; s.rebasing = true;
      if (t >= this.rebase.until && this.rebase.samples.length >= 2) {
        const k = this.rebase.samples;
        this.base = { hipY: median(k.map(q => q.hipY)), shY: median(k.map(q => q.shY)), torso: median(k.map(q => q.torso)), shW: median(k.map(q => q.shW)) };
        this.rebase = null; s.rebasing = false;
      }
      return s;
    }
    if (!b.shW) b.shW = shW;

    // --- Nhảy / ngồi: so với baseline, chuẩn hoá theo chiều dài thân ---
    s.rise = hipsOk ? (b.hipY - hip.y) / b.torso : (b.shY - sh.y) / b.torso;
    s.drop = (sh.y - b.shY) / b.torso;

    if (!s.airborne && !s.ducking && s.rise > c.jumpEnter) { s.airborne = true; this.airSince = t; }
    else if (s.airborne && s.rise < c.jumpExit) s.airborne = false;

    if (!s.ducking && !s.airborne && s.drop > c.duckEnter) { s.ducking = true; this.duckSince = t; }
    else if (s.ducking && s.drop < c.duckExit) s.ducking = false;

    // Bảo vệ trôi baseline (người tiến/lùi, điện thoại xê dịch): trạng thái kéo dài bất thường → hiệu chỉnh lại
    if ((s.airborne && t - this.airSince > c.maxAirborneMs) || (s.ducking && t - this.duckSince > c.maxDuckMs)) {
      this.base = { hipY: hip.y, shY: sh.y, torso, shW };
      s.airborne = s.ducking = false; s.rise = s.drop = 0;
    } else if (!s.airborne && !s.ducking && Math.abs(s.rise) < 0.1 && Math.abs(s.drop) < 0.1) {
      const a = c.adaptRate;
      b.hipY += (hip.y - b.hipY) * a; b.shY += (sh.y - b.shY) * a; b.torso += (torso - b.torso) * a; b.shW += (shW - b.shW) * a;
    }
    return s;
  }

  /** Nhắc khoảng cách. full: theo chiều cao đầu→chân. near: theo bề rộng vai (đầu→hông là đủ). */
  _distance(raw) {
    const c = this.cfg, s = this.state, d = s.distance;
    const la = raw[LM.L_AN], ra = raw[LM.R_AN], nose = raw[LM.NOSE], ls = raw[LM.L_SH], rs = raw[LM.R_SH];
    s.fullBody = vis(la, c.visMin) && vis(ra, c.visMin) && la.y < 0.99 && ra.y < 0.99;
    d.shoulderFrac = Math.abs(ls.x - rs.x);
    const headOk = vis(nose, 0.4) && nose.y > 0.02;
    if (this.mode === 'near') {
      d.bodyFrac = 0;
      d.hint = !headOk || d.shoulderFrac > c.nearShoulderMax ? 'farther' : d.shoulderFrac < c.nearShoulderMin ? 'closer' : 'ok';
      const hfov = (this.videoPortrait ? 45 : 62) * Math.PI / 180; // FOV ngang giả định của camera trước
      d.meters = d.shoulderFrac > 0.03 ? 0.36 / (d.shoulderFrac * 2 * Math.tan(hfov / 2)) : null;
      return;
    }
    d.bodyFrac = nose ? Math.max(la?.y ?? 0, ra?.y ?? 0) - nose.y : 0;
    d.hint = !s.fullBody || d.bodyFrac > 0.92 ? 'farther' : d.bodyFrac < 0.42 ? 'closer' : 'ok';
    const vfov = (this.videoPortrait ? 62 : 48) * Math.PI / 180;
    d.meters = s.fullBody && d.bodyFrac > 0.05 ? 1.5 / (d.bodyFrac * 2 * Math.tan(vfov / 2)) : null;
  }

  /** Mất dấu chốc lát (mờ do chuyển động nhanh, tay che vai…) → giữ nguyên trạng thái trong coastMs. */
  _lost(t) {
    const s = this.state;
    if (s.present && t - this.lastSeen <= this.cfg.coastMs) { s.coasting = true; return s; }
    s.present = false; s.coasting = false; s.fullBody = false; s.distance.hint = 'none';
    s.airborne = false; s.ducking = false; s.handsUp = false; s.oneHandUp = false;
    this.prevAnchorY = null;
    return s;
  }
}

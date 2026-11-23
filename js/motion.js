// Biến landmark thành "input game": làn (0/1/2), đang nhảy, đang ngồi, giơ tay, khoảng cách.
// Thuần logic, không đụng DOM → test được bằng Node (tests/motion.test.mjs).
import { CONFIG } from './config.js';
import { LM } from './pose.js';

const vis = (p, m) => !!p && p.v >= m;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const median = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

export class MotionTracker {
  constructor(cfg = CONFIG.MOTION) {
    this.cfg = cfg;
    this.videoPortrait = true; // để ước lượng mét (FOV dọc khác nhau theo hướng khung hình)
    this.reset();
  }

  reset() {
    this.base = null; this.calib = []; this.calibrating = false;
    this.airSince = 0; this.duckSince = 0; this.prevHipY = null;
    this.state = {
      present: false, fullBody: false, calibrated: false, calibProgress: 0,
      lane: 1, laneX: 0.5, airborne: false, ducking: false, handsUp: false, oneHandUp: false,
      rise: 0, drop: 0, distance: { hint: 'none', bodyFrac: 0, meters: null },
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
   * @param W,H  kích thước viewport (px CSS)
   * @param t    thời gian ms
   */
  update(pts, raw, W, H, t) {
    const c = this.cfg, s = this.state;
    if (!pts || !raw) return this._lost();
    const ls = pts[LM.L_SH], rs = pts[LM.R_SH], lh = pts[LM.L_HIP], rh = pts[LM.R_HIP];
    if (![ls, rs, lh, rh].every(p => vis(p, c.visMin))) return this._lost();
    s.present = true;

    const sh = mid(ls, rs), hip = mid(lh, rh);
    const torso = Math.max(1, hip.y - sh.y);

    // --- Khoảng cách (depth estimation đơn giản từ chiều cao cơ thể trong khung hình) ---
    const la = raw[LM.L_AN], ra = raw[LM.R_AN], nose = raw[LM.NOSE];
    s.fullBody = vis(la, c.visMin) && vis(ra, c.visMin) && la.y < 0.99 && ra.y < 0.99;
    const bodyFrac = nose ? Math.max(la?.y ?? 0, ra?.y ?? 0) - nose.y : 0;
    s.distance.bodyFrac = bodyFrac;
    s.distance.hint = !s.fullBody || bodyFrac > 0.92 ? 'farther' : bodyFrac < 0.42 ? 'closer' : 'ok';
    const fov = (this.videoPortrait ? 62 : 48) * Math.PI / 180; // giả định FOV camera trước điển hình
    s.distance.meters = s.fullBody && bodyFrac > 0.05 ? 1.5 / (bodyFrac * 2 * Math.tan(fov / 2)) : null;

    // --- Làn: vị trí hông theo bề ngang màn hình, có trễ để không rung giữa 2 làn ---
    s.laneX = Math.min(1, Math.max(0, hip.x / W));
    const h = c.laneHyst, x = s.laneX;
    if (s.lane === 0 && x > 1 / 3 + h) s.lane = x > 2 / 3 + h ? 2 : 1;
    else if (s.lane === 2 && x < 2 / 3 - h) s.lane = x < 1 / 3 - h ? 0 : 1;
    else if (s.lane === 1) { if (x < 1 / 3 - h) s.lane = 0; else if (x > 2 / 3 + h) s.lane = 2; }

    // --- Giơ tay (lấy sao, bắt đầu/chơi lại không cần chạm màn hình) ---
    const n = pts[LM.NOSE], lw = pts[LM.L_WR], rw = pts[LM.R_WR];
    const lUp = vis(lw, 0.4) && vis(n, 0.4) && lw.y < n.y;
    const rUp = vis(rw, 0.4) && vis(n, 0.4) && rw.y < n.y;
    s.handsUp = lUp && rUp; s.oneHandUp = lUp || rUp;

    // --- Hiệu chỉnh: lấy trung vị khi người đứng yên ---
    if (this.calibrating && this.calibGate) {
      const stable = this.prevHipY !== null && Math.abs(hip.y - this.prevHipY) / torso < 0.03;
      if (stable) this.calib.push({ hipY: hip.y, shY: sh.y, torso, t });
      if (this.calib.length > 3 && Math.abs(hip.y - median(this.calib.map(k => k.hipY))) / torso > 0.12) this.calib = [];
      // đủ khi đứng yên ≥ calibMs VÀ có ≥ calibSamples mẫu (máy chậm vẫn hiệu chỉnh được trong ~1s)
      const span = this.calib.length ? t - this.calib[0].t : 0;
      s.calibProgress = Math.min(1, span / c.calibMs, this.calib.length / c.calibSamples);
      if (span >= c.calibMs && this.calib.length >= c.calibSamples) {
        this.base = {
          hipY: median(this.calib.map(k => k.hipY)),
          shY: median(this.calib.map(k => k.shY)),
          torso: median(this.calib.map(k => k.torso)),
        };
        this.calibrating = false;
      }
    }
    this.prevHipY = hip.y;
    s.calibrated = !!this.base;
    if (!this.base) return s;

    // --- Nhảy / ngồi: so với baseline, chuẩn hoá theo chiều dài thân ---
    const b = this.base;
    s.rise = (b.hipY - hip.y) / b.torso;
    s.drop = (sh.y - b.shY) / b.torso;

    if (!s.airborne && !s.ducking && s.rise > c.jumpEnter) { s.airborne = true; this.airSince = t; }
    else if (s.airborne && s.rise < c.jumpExit) s.airborne = false;

    if (!s.ducking && !s.airborne && s.drop > c.duckEnter) { s.ducking = true; this.duckSince = t; }
    else if (s.ducking && s.drop < c.duckExit) s.ducking = false;

    // Bảo vệ trôi baseline (người tiến/lùi, điện thoại xê dịch): trạng thái kéo dài bất thường → hiệu chỉnh lại
    if ((s.airborne && t - this.airSince > c.maxAirborneMs) || (s.ducking && t - this.duckSince > c.maxDuckMs)) {
      this.base = { hipY: hip.y, shY: sh.y, torso };
      s.airborne = s.ducking = false; s.rise = s.drop = 0;
    } else if (!s.airborne && !s.ducking && Math.abs(s.rise) < 0.1 && Math.abs(s.drop) < 0.1) {
      const a = c.adaptRate;
      b.hipY += (hip.y - b.hipY) * a; b.shY += (sh.y - b.shY) * a; b.torso += (torso - b.torso) * a;
    }
    return s;
  }

  _lost() {
    const s = this.state;
    s.present = false; s.fullBody = false; s.distance.hint = 'none';
    s.airborne = false; s.ducking = false; s.handsUp = false; s.oneHandUp = false;
    this.prevHipY = null;
    return s;
  }
}

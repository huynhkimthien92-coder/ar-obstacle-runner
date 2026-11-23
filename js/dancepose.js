// Nhận diện động tác + vỗ tay cho game "Vũ hội công chúa" — thuần logic, test được bằng Node.
// Đầu vào: 33 điểm MediaPipe đã đổi sang toạ độ MÀN HÌNH (đã lật gương), mỗi điểm {x, y, v}.
//  - Thước đo cơ thể: max(bề rộng vai, 0,55 × chiều dài thân vai→hông) → đứng hơi nghiêng vẫn đúng.
//  - Mỗi tay: góc so với phương thẳng đứng (0 = buông, 90° = dang ngang, 180° = giơ thẳng); lấy hướng vai→cổ tay,
//    cổ tay mờ / ra ngoài khung (giơ cao quá đầu) thì dùng vai→khuỷu.
//  - Trễ (hysteresis): vào lớp cần vượt ngưỡng + 8°, ra cần lùi 8°; đổi lớp phải ổn định ≥ 2 khung hình.
//  - Vỗ tay: khoảng cách 2 bàn tay (min của cổ tay / ngón trỏ / ngón út) theo thước cơ thể; bắt "khép lại rồi mở ra"
//    (cực tiểu cục bộ) nên cú vỗ nhanh lọt giữa 2 khung hình vẫn bắt được; thời điểm = lúc khoảng cách nhỏ nhất.

const DEG = Math.PI / 180;
export const DP_CFG = {
  vis: 0.5,            // độ tin cậy tối thiểu của điểm
  // ngưỡng góc tay (độ): buông < downMax; dang ngang outMin..outMax; giơ > upMin
  downMax: 40, outMin: 58, outMax: 125, upMin: 135, hyst: 8,
  reachMin: 0.55,      // tay dang ngang phải duỗi: |vai→cổ tay| ≥ 0,55 × chiều dài tay ước tính (≈ 1,25 thước)
  stableFrames: 2,
  clapOn: 0.42, clapOff: 0.75, // khoảng cách 2 tay / thước: chạm < clapOn, mở > clapOff
  clapNear: 0.85,      // cực tiểu < clapNear và tốc độ khép đủ nhanh cũng tính (vỗ nhanh giữa 2 khung)
  clapSpeed: 2.2,      // thước/giây
  clapGapMs: 180,
};

const ok = (p, c) => p && p.v >= c.vis;

/** Thước đo cơ thể (px) + điểm giữa vai, hoặc null nếu không thấy 2 vai. */
export function bodyScale(p, c = DP_CFG) {
  const a = p?.[11], b = p?.[12];
  if (!ok(a, c) || !ok(b, c)) return null;
  const sw = Math.hypot(a.x - b.x, a.y - b.y);
  let tor = 0;
  if (ok(p[23], c) && ok(p[24], c)) tor = Math.hypot((a.x + b.x - p[23].x - p[24].x) / 2, (a.y + b.y - p[23].y - p[24].y) / 2);
  return { s: Math.max(8, sw, tor * 0.55), sw, tor, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** Góc tay (độ) so với phương thẳng đứng hướng xuống + hướng ngang (+1 ra ngoài thân). side: -1 tay bên trái màn hình, +1 bên phải. */
export function armAngle(p, sh, el, wr, side, scale, c = DP_CFG) {
  const S = p[sh];
  let T = null, reach = 1;
  if (ok(p[wr], c)) { T = p[wr]; reach = Math.hypot(T.x - S.x, T.y - S.y) / (scale * 1.25); }
  if (ok(p[el], c)) {
    const E = p[el], de = Math.hypot(E.x - S.x, E.y - S.y);
    // cổ tay mờ, hoặc cổ tay "co" bất thường so với khuỷu → dùng khuỷu (giơ tay quá khung hình)
    if (!T) { T = E; reach = de / (scale * 0.62); }
  }
  if (!T) return null;
  const dx = (T.x - S.x) * side, dy = T.y - S.y; // dy > 0 là xuống
  const ang = Math.atan2(dx, dy) / DEG;          // 0 = xuống, 90 = ngang ra ngoài, 180 = lên, âm = vắt qua thân
  return { ang, reach, wristOk: ok(p[wr], c) };
}

/** Phân lớp 1 tay có trễ: prev là lớp trước đó. Trả về 'up' | 'out' | 'down' | 'mid' | 'none'. */
export function armClass(a, prev, c = DP_CFG) {
  if (!a) return 'none';
  const A = a.ang < -100 ? 360 + a.ang : a.ang; // giơ lên hơi vắt vào giữa đầu (-170°) = 190° → vẫn là "giơ"
  const inR = (cls, lo, hi) => { const k = prev === cls ? c.hyst : -c.hyst; return A >= lo - k && A <= hi + k; };
  if (inR('up', c.upMin, 265)) return 'up';
  if (inR('out', c.outMin, c.outMax) && a.reach >= c.reachMin) return 'out';
  if (inR('down', -60, c.downMax)) return 'down';
  return 'mid';
}

/** Ghép 2 tay → mã động tác của game (null = không rõ). */
export function combine(L, R) {
  if (L === 'up' && R === 'up') return 'UP';
  if (L === 'up' && R === 'down') return 'UL';
  if (R === 'up' && L === 'down') return 'UR';
  if (L === 'out' && R === 'down') return 'L';
  if (R === 'out' && L === 'down') return 'R';
  if (L === 'down' && R === 'down') return 'REST';
  return null;
}

export class DancePoseDetector {
  constructor(cfg = {}) { this.c = { ...DP_CFG, ...cfg }; this.reset(); }
  reset() {
    this.L = 'none'; this.R = 'none'; this.cand = null; this.candN = 0; this.pose = null;
    this.clapOn = false; this.lastClap = -1e9; this.hist = []; this.dbg = null;
  }
  /**
   * @param p   điểm đã làm mượt (toạ độ màn hình) — dùng cho tư thế
   * @param ducking  bộ nhận ngồi chung (motion.state.ducking)
   * @returns mã động tác ổn định hoặc null
   */
  pose_(p, ducking) {
    const c = this.c, sc = bodyScale(p, c);
    if (!sc) { this.dbg = { why: 'vai' }; return this._commit(null); }
    // tay bên trái màn hình
    const [lS, rS] = p[11].x <= p[12].x ? [[11, 13, 15], [12, 14, 16]] : [[12, 14, 16], [11, 13, 15]];
    const aL = armAngle(p, ...lS, -1, sc.s, c), aR = armAngle(p, ...rS, 1, sc.s, c);
    this.L = armClass(aL, this.L, c); this.R = armClass(aR, this.R, c);
    this.dbg = { aL: aL && Math.round(aL.ang), aR: aR && Math.round(aR.ang), L: this.L, R: this.R, s: Math.round(sc.s) };
    if (ducking) return this._commit('DN');
    let P = combine(this.L, this.R);
    if (P == null && (this.L === 'mid' || this.R === 'mid') && this.pose && this.pose !== 'DN') P = this.pose; // đang chuyển tiếp → giữ
    return this._commit(P === 'REST' ? null : P);
  }
  _commit(P) {
    if (P === this.cand) this.candN++; else { this.cand = P; this.candN = 1; }
    if (this.candN >= this.c.stableFrames || P === this.pose) this.pose = P;
    return this.pose;
  }
  update(p, ducking) { return this.pose_(p, ducking); }

  /**
   * Vỗ tay. raw: điểm CHƯA làm mượt (đỡ trễ), toạ độ màn hình; ts: thời điểm khung (ms).
   * @returns thời điểm vỗ (ms) hoặc null.
   */
  clap(raw, ts) {
    const c = this.c, sc = bodyScale(raw, c);
    if (!sc) { this.hist.length = 0; this.clapOn = false; return null; }
    const pairs = [[15, 16], [19, 20], [17, 18], [15, 20], [19, 16]];
    let d = Infinity;
    for (const [a, b] of pairs) if (ok(raw[a], c) && ok(raw[b], c)) d = Math.min(d, Math.hypot(raw[a].x - raw[b].x, raw[a].y - raw[b].y));
    if (!isFinite(d)) { this.hist.length = 0; this.clapOn = false; return null; }
    d /= sc.s;
    // tay phải ở trước thân: không thấp hơn hông quá nhiều
    const hy = ok(raw[23], c) && ok(raw[24], c) ? (raw[23].y + raw[24].y) / 2 : sc.mid.y + sc.s * 2.2;
    const handY = Math.min(raw[15]?.y ?? 1e9, raw[16]?.y ?? 1e9);
    const inZone = handY < hy + sc.s * 0.6;
    const H = this.hist; H.push({ d, ts, inZone }); if (H.length > 6) H.shift();
    let hit = null;
    if (!this.clapOn && d < c.clapOn && inZone) { this.clapOn = true; hit = ts; }
    else if (this.clapOn && d > c.clapOff) this.clapOn = false;
    // cú vỗ nhanh: cực tiểu ở khung giữa, khép & mở đều nhanh
    if (!hit && !this.clapOn && H.length >= 3) {
      const [a, m, b] = H.slice(-3);
      const vin = (a.d - m.d) / Math.max(1, m.ts - a.ts) * 1000, vout = (b.d - m.d) / Math.max(1, b.ts - m.ts) * 1000;
      if (m.d < c.clapNear && m.inZone && vin > c.clapSpeed && vout > c.clapSpeed * 0.6 && m.d < a.d && m.d <= b.d) hit = m.ts;
    }
    if (hit != null && hit - this.lastClap > c.clapGapMs) { this.lastClap = hit; return hit; }
    return null;
  }
}

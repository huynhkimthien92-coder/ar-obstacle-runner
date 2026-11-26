// Lọc "người giả": MediaPipe đôi khi vẽ khung xương lên ghế, rèm, áo treo… khi không có ai trong khung.
// Hai lớp lọc, đều chạy trên máy, không tốn thêm suy luận:
//  1) plausiblePerson(): khung xương phải giống người thật (đủ rõ mặt + vai, đầu trên vai, tỉ lệ thân hợp lý,
//     và nếu có mặt nạ tách người thì phần ngực / đầu phải nằm trong mặt nạ).
//  2) PresenceGate: người mới xuất hiện phải "đứng vững" liên tục ~0,45 s, khung xương không nhảy loạn,
//     mới được tính là có người. Vật thể thường chỉ lóe lên vài khung hình hoặc rung giật mạnh.
// QUAN TRỌNG: kiểm tra CHẶT chỉ dùng để NHẬN người mới. Người ĐANG chơi chỉ cần qua kiểm tra DỄ (keepPerson: thấy vai,
// thân hợp lý) — vì lúc cúi, ngồi, xoay, giơ tay che mặt, chạy nhanh bị nhoè, phòng tối… mặt thường mờ đi.
// Mất dấu ngắn (< 3 s) rồi hiện lại gần chỗ cũ → nhận lại ngay, không bắt xác nhận lại.
// Thuần logic → test bằng Node.

export const CHECK = {
  coreVis: 0.5,        // mũi + 2 vai: mỗi điểm phải rõ ít nhất mức này
  coreMean: 0.65,      // …và trung bình 3 điểm ≥ mức này
  faceMin: 3,          // số điểm mặt (mắt, tai, miệng: 1..10) rõ > 0.5 tối thiểu
  minShoulder: 0.025,  // bề rộng vai tối thiểu (tỉ lệ bề ngang khung) — nhỏ hơn là nhiễu
  maskMin: 0.3,        // giá trị mặt nạ trung bình tại vai / ngực
  confirmMs: 450,      // người mới phải xuất hiện liên tục chừng này mới tính
  gapMs: 600,          // mất dấu lâu hơn (hoặc hơn 2,5 lần nhịp nhận diện, máy chậm) → lần sau phải xác nhận lại
  jitterMax: 0.45,     // độ giật trung bình mỗi khung (theo bề rộng vai) khi đang xác nhận
  keepVis: 0.3,        // giữ người đang chơi: 2 vai rõ tối thiểu mức này (hoặc 1 vai + 2 hông)
  reacquireMs: 3000,   // mất dấu ngắn hơn chừng này + hiện lại gần chỗ cũ → nhận lại ngay
  reacquireDist: 2.2,  // "gần chỗ cũ": vai giữa lệch < 2,2 × bề rộng vai (hoặc < 25% khung)
  staleMs: 10000,      // người đang chơi phải rõ mặt ít nhất 1 lần / 10 s (đồ vật đứng thế chỗ người vừa đi thì không bao giờ rõ mặt)
};

/**
 * Kiểm tra DỄ cho người đã được nhận (đang chơi): chỉ cần thấy vai và khung xương không vô lý. Không đòi thấy mặt, không đòi mặt nạ.
 */
export function keepPerson(lm, ar = 16 / 9, cfg = CHECK) {
  if (!lm || lm.length < 25) return { ok: false, reason: 'thiếu điểm' };
  const ls = lm[11], rs = lm[12], lh = lm[23], rh = lm[24];
  const both = vis(ls, cfg.keepVis) && vis(rs, cfg.keepVis), oneHip = (vis(ls, cfg.keepVis) || vis(rs, cfg.keepVis)) && vis(lh, 0.4) && vis(rh, 0.4);
  if (!both && !oneHip) return { ok: false, reason: 'không thấy vai' };
  const P = p => ({ x: p.x * ar, y: p.y });
  const a = P(ls), b = P(rs), shW = Math.hypot(a.x - b.x, a.y - b.y);
  const hipsSeen = vis(lh, 0.4) && vis(rh, 0.4);
  const torso = hipsSeen ? Math.hypot((P(lh).x + P(rh).x - a.x - b.x) / 2, (P(lh).y + P(rh).y - a.y - b.y) / 2) : 0;
  const S = Math.max(shW, torso * 0.5);
  if (S < cfg.minShoulder * ar * 0.6) return { ok: false, reason: 'quá nhỏ' };
  for (const [s0, e] of [[11, 13], [12, 14]]) {
    if (vis(lm[e], 0.6) && vis(lm[s0], cfg.keepVis)) { const A = P(lm[s0]), B = P(lm[e]); if (Math.hypot(A.x - B.x, A.y - B.y) > 3 * S) return { ok: false, reason: 'tay sai tỉ lệ' }; }
  }
  return { ok: true, reason: '' };
}

const vis = (p, m) => !!p && (p.v ?? 1) >= m;

/**
 * @param lm   33 landmark chuẩn hoá (x, y theo 0..1 của khung nhận diện; v = visibility)
 * @param ar   tỉ lệ khung = rộng / cao (để đo khoảng cách đúng theo pixel)
 * @param mask { w, h, data } mặt nạ tách người của chính người này (tuỳ chọn)
 * @returns { ok, reason }
 */
export function plausiblePerson(lm, ar = 16 / 9, mask = null, cfg = CHECK) {
  if (!lm || lm.length < 25) return { ok: false, reason: 'thiếu điểm' };
  const n = lm[0], ls = lm[11], rs = lm[12];
  if (!vis(n, cfg.coreVis) || !vis(ls, cfg.coreVis) || !vis(rs, cfg.coreVis)) return { ok: false, reason: 'mặt/vai mờ' };
  if (((n.v ?? 1) + (ls.v ?? 1) + (rs.v ?? 1)) / 3 < cfg.coreMean) return { ok: false, reason: 'mặt/vai mờ' };
  let face = 0;
  for (let i = 1; i <= 10; i++) if (vis(lm[i], 0.5)) face++;
  if (face < cfg.faceMin) return { ok: false, reason: 'không rõ mặt' };
  // đo bằng "pixel" (x nhân tỉ lệ khung) để vai/thân không bị méo theo khung dọc/ngang
  const P = p => ({ x: p.x * ar, y: p.y });
  const a = P(ls), b = P(rs), N = P(n);
  const shW = Math.hypot(a.x - b.x, a.y - b.y), sh = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const lh = lm[23], rh = lm[24], hipsSeen = vis(lh, 0.5) && vis(rh, 0.5) && lh.y < 0.98 && rh.y < 0.98; // hông ngoài khung (đứng gần) thì MediaPipe chỉ đoán → bỏ qua
  const c = hipsSeen ? P(lh) : null, d = hipsSeen ? P(rh) : null, hip = hipsSeen ? { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 } : null;
  const torso = hipsSeen ? Math.hypot(hip.x - sh.x, hip.y - sh.y) : 0;
  // "cỡ người": người xoay nghiêng thì vai hẹp lại → lấy thêm chiều dài thân / cổ để không loại nhầm
  const S = Math.max(shW, torso * 0.5, (sh.y - N.y) * 1.1);
  if (S < cfg.minShoulder * ar) return { ok: false, reason: 'quá nhỏ' };
  if (N.y > sh.y - 0.12 * S) return { ok: false, reason: 'đầu không ở trên vai' };
  if (Math.abs(N.x - sh.x) > 0.9 * S) return { ok: false, reason: 'đầu lệch khỏi vai' };
  if (sh.y - N.y > 2.2 * Math.max(shW, torso * 0.5)) return { ok: false, reason: 'cổ dài bất thường' };
  if (hipsSeen) {
    const hipW = Math.hypot(c.x - d.x, c.y - d.y);
    if (hip.y < sh.y + 0.5 * S * 0.6) return { ok: false, reason: 'hông không ở dưới vai' };
    if (torso < 0.6 * shW || torso > 4.2 * S) return { ok: false, reason: 'thân sai tỉ lệ' };
    if (shW > 0.5 * S && hipW > 1.8 * shW) return { ok: false, reason: 'hông sai tỉ lệ' };
  }
  for (const [s0, e] of [[11, 13], [12, 14]]) { // cánh tay trên: không thể dài gấp mấy lần cỡ người
    if (vis(lm[e], 0.6)) { const A = P(lm[s0]), B = P(lm[e]); if (Math.hypot(A.x - B.x, A.y - B.y) > 2.4 * S) return { ok: false, reason: 'tay sai tỉ lệ' }; }
  }
  if (mask?.data) {
    const at = (x, y) => { // x, y chuẩn hoá 0..1
      const px = Math.max(0, Math.min(mask.w - 1, Math.round(x * mask.w))), py = Math.max(0, Math.min(mask.h - 1, Math.round(y * mask.h)));
      return mask.data[py * mask.w + px];
    };
    const mx = (ls.x + rs.x) / 2, my = (ls.y + rs.y) / 2; // ngực: dưới giữa 2 vai nửa bề rộng vai
    const m = (at(mx, my) + at(mx, Math.min(1, my + S * 0.5)) + at(ls.x * 0.7 + rs.x * 0.3, my) + at(ls.x * 0.3 + rs.x * 0.7, my)) / 4;
    if (m < cfg.maskMin) return { ok: false, reason: 'không nằm trong mặt nạ người' };
  }
  return { ok: true, reason: '' };
}

/**
 * Cổng xác nhận theo thời gian cho MỘT người (người chính). Gọi update() mỗi lần có kết quả nhận diện.
 * Trả về landmark nếu người đã được xác nhận, ngược lại null.
 */
/** Khoảng mất dấu cho phép: máy chậm (nhận diện thưa) thì nới theo nhịp thực tế. */
export const gapFor = (dtEma, cfg = CHECK) => Math.max(cfg.gapMs, 2.5 * (dtEma || 0));

export class PresenceGate {
  constructor(cfg = CHECK) { this.cfg = cfg; this.reset(); }
  reset() { this.since = 0; this.last = 0; this.confirmed = false; this.prev = null; this.jit = 0; this.nJit = 0; this.dt = 0; this.tick = null; this.lastGood = null; this.lastStrict = 0; }
  /**
   * @param lm      khung xương (đã qua kiểm tra DỄ) hoặc null
   * @param strict  khung này có qua kiểm tra CHẶT không (rõ mặt, đúng mặt nạ…) — chỉ cần khi nhận người MỚI
   */
  update(lm, t, ar = 16 / 9, strict = true) {
    const c = this.cfg;
    if (this.tick != null) { const d = Math.min(3000, t - this.tick); this.dt = this.dt ? this.dt * 0.9 + d * 0.1 : d; } // nhịp nhận diện
    this.tick = t;
    const gap = gapFor(this.dt, c);
    if (!lm) { if (this.confirmed && t - this.last > gap) { this.confirmed = false; this.since = 0; this.prev = null; } else if (!this.confirmed && t - this.last > gap) { this.since = 0; this.prev = null; } return null; }
    const cur = { x: ((lm[11].x + lm[12].x) / 2) * ar, y: (lm[11].y + lm[12].y) / 2, w: Math.hypot((lm[11].x - lm[12].x) * ar, lm[11].y - lm[12].y) || 1e-3, nx: lm[0].x * ar, ny: lm[0].y };
    if (strict) this.lastStrict = t;
    if (this.confirmed && !strict && t - this.lastStrict > c.staleMs) { this.confirmed = false; this.lastGood = null; this.since = 0; this.prev = null; return null; } // lâu quá không thấy mặt → coi như không phải người
    // người đang chơi vừa khuất ngắn rồi hiện lại gần chỗ cũ → nhận lại ngay (không cần rõ mặt, không chờ xác nhận)
    const G = this.lastGood;
    if (G && t - this.lastStrict <= c.staleMs && t - G.t < c.reacquireMs && Math.hypot(cur.x - G.x, cur.y - G.y) < Math.max(c.reacquireDist * Math.max(G.w, cur.w), 0.25 * ar)) {
      this.confirmed = true; this.prev = cur; this.last = t; this.since = this.since || t;
      this.lastGood = { x: cur.x, y: cur.y, w: cur.w, t };
      return lm;
    }
    if (this.last && t - this.last > gap) { this.confirmed = false; this.since = 0; this.prev = null; }
    if (!this.confirmed && !strict) { this.since = 0; this.prev = null; return null; } // người MỚI phải rõ mặt mới bắt đầu tính
    if (!this.since) { this.since = t; this.jit = 0; this.nJit = 0; }
    if (!this.confirmed && this.prev) {
      // độ giật: vai giữa + mũi + bề rộng vai thay đổi bao nhiêu so với khung trước, theo bề rộng vai
      const d = (Math.hypot(cur.x - this.prev.x, cur.y - this.prev.y) + Math.hypot(cur.nx - this.prev.nx, cur.ny - this.prev.ny) + Math.abs(cur.w - this.prev.w)) / cur.w;
      this.jit += d; this.nJit++;
    }
    this.prev = cur; this.last = t;
    if (!this.confirmed && t - this.since >= c.confirmMs) {
      if (this.nJit >= 2 && this.jit / this.nJit > c.jitterMax) { this.since = t; this.jit = 0; this.nJit = 0; return null; } // rung loạn → xác nhận lại từ đầu
      this.confirmed = true;
    }
    if (this.confirmed) this.lastGood = { x: cur.x, y: cur.y, w: cur.w, t };
    return this.confirmed ? lm : null;
  }
}

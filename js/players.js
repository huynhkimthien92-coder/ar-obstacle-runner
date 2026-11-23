// Theo dõi nhiều người chơi cùng khung hình (game "Ô an toàn").
// MediaPipe trả về tối đa N bộ khung xương mỗi frame nhưng KHÔNG có ID → tự ghép theo vị trí gần nhất giữa các frame.
import { PoseSmoother } from './filters.js';
import { LM } from './pose.js';

export const PLAYER_COLORS = ['#00e5ff', '#ff9f1c', '#c77dff', '#7dffb0'];
const vis = (p, m = 0.5) => !!p && p.v >= m;

export class PlayerTracker {
  constructor(max = 4) { this.max = max; this.list = []; this.nextId = 1; this.keep = new Set(); }

  /** ids trong `keep` (người đã đăng ký vào ván) được giữ chỗ lâu hơn khi tạm khuất, để quay lại vẫn đúng người. */
  setKeep(ids) { this.keep = new Set(ids); }

  /**
   * @param all     mảng landmark chuẩn hoá (0..1) của từng người MediaPipe thấy trong frame
   * @param mapper  hàm đổi toạ độ video → màn hình
   */
  update(all, mapper, W, H, t) {
    const dets = (all || []).map(lm => {
      const ls = lm[LM.L_SH], rs = lm[LM.R_SH];
      if (!vis(ls, 0.35) || !vis(rs, 0.35)) return null;
      const a = mapper(ls), b = mapper(rs);
      return { lm, c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }).filter(Boolean);

    // ghép greedy theo khoảng cách nhỏ nhất; người đang khuất được phép "nhảy" xa hơn khi quay lại
    const pairs = [];
    for (const p of this.list) for (let i = 0; i < dets.length; i++) {
      const d = Math.hypot(p.c.x - dets[i].c.x, p.c.y - dets[i].c.y);
      const limit = (t - p.lastSeen > 300 ? 0.45 : 0.22) * W;
      if (d < limit) pairs.push({ p, i, d });
    }
    pairs.sort((a, b) => a.d - b.d);
    const usedP = new Set(), usedD = new Set();
    for (const { p, i } of pairs) {
      if (usedP.has(p) || usedD.has(i)) continue;
      usedP.add(p); usedD.add(i); this._assign(p, dets[i], mapper, W, H, t);
    }
    for (let i = 0; i < dets.length; i++) {
      if (usedD.has(i) || this.list.length >= this.max + 2) continue;
      // ưu tiên trả lại ID cho người đã đăng ký đang khuất (vd. bị người khác che rồi hiện lại)
      const missing = this.list.filter(p => !usedP.has(p) && this.keep.has(p.id) && t - p.lastSeen > 300)
        .sort((a, b) => Math.hypot(a.c.x - dets[i].c.x, a.c.y - dets[i].c.y) - Math.hypot(b.c.x - dets[i].c.x, b.c.y - dets[i].c.y))[0];
      const p = missing || this._new();
      usedP.add(p); this._assign(p, dets[i], mapper, W, H, t);
    }
    for (const p of this.list) if (!usedP.has(p)) p.present = t - p.lastSeen < 600; // khuất < 0.6s vẫn tính có mặt
    this.list = this.list.filter(p => t - p.lastSeen < (this.keep.has(p.id) ? 15000 : 1500));
    return this.list;
  }

  _new() {
    const used = new Set(this.list.map(p => p.color));
    const color = PLAYER_COLORS.find(c => !used.has(c)) || '#ffffff';
    const p = { id: this.nextId++, color, smoother: new PoseSmoother(), present: false, lastSeen: 0, c: { x: 0, y: 0 } };
    this.list.push(p);
    return p;
  }

  _assign(p, det, mapper, W, H, t) {
    const raw = p.smoother.apply(det.lm, t);
    const pts = raw.map(mapper);
    p.raw = raw; p.pts = pts; p.c = det.c; p.lastSeen = t; p.present = true;
    // Điểm chân trên sàn: giữa 2 mắt cá; không thấy chân thì ước lượng từ hông/vai
    const la = pts[LM.L_AN], ra = pts[LM.R_AN], lh = pts[LM.L_HIP], rh = pts[LM.R_HIP], ls = pts[LM.L_SH], rs = pts[LM.R_SH];
    if (vis(la) && vis(ra)) { p.feet = { x: (la.x + ra.x) / 2, y: Math.max(la.y, ra.y) }; p.feetSeen = true; }
    else {
      p.feetSeen = false;
      const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2;
      if (vis(lh) && vis(rh)) { const hy = (lh.y + rh.y) / 2; p.feet = { x: (lh.x + rh.x) / 2, y: hy + (hy - sy) * 1.8 }; }
      else p.feet = { x: sx, y: sy + Math.hypot(ls.x - rs.x, ls.y - rs.y) * 3.9 };
    }
    const nose = pts[LM.NOSE];
    p.head = vis(nose, 0.4) ? { x: nose.x, y: nose.y } : { x: p.c.x, y: p.c.y - Math.abs(ls.x - rs.x) };
    const lw = pts[LM.L_WR], rw = pts[LM.R_WR];
    p.handsUp = vis(lw, 0.35) && vis(rw, 0.35) && lw.y < p.head.y && rw.y < p.head.y;
  }
}

// Theo dõi nhiều người chơi cùng khung hình (game "Ô an toàn", "Chém trái cây" 2 người).
// MediaPipe trả về tối đa N bộ khung xương mỗi frame nhưng KHÔNG có ID → tự ghép giữa các frame.
// Khi 2 người đứng sát nhau rất dễ tráo ID, nên ghép theo:
//   • vị trí DỰ ĐOÁN (có tính vận tốc), không chỉ vị trí cũ
//   • "màu quần áo" vùng ngực / bụng của từng người (chữ ký màu) — 2 người khác áo thì không tráo nhau
//   • chọn cách ghép tốt nhất cho CẢ NHÓM (thử mọi hoán vị, tối đa 4 người) thay vì ghép tham lam từng cặp
// Màu áo chỉ làm "nghiêng cán cân", không loại hẳn (người quay lưng / đèn đổi vẫn nhận lại được).
// Và lọc: khung xương trùng (MediaPipe vẽ 2 lần cùng 1 người), chân "mượn" của người bên cạnh.
import { PoseSmoother } from './filters.js';
import { LM } from './pose.js';
import { CHECK, gapFor } from './personcheck.js';

export const PLAYER_COLORS = ['#00e5ff', '#ff9f1c', '#c77dff', '#7dffb0'];
const vis = (p, m = 0.5) => !!p && p.v >= m;

export const TRACK = {
  posLimit: 0.22,      // (× W) di chuyển tối đa giữa 2 khung còn ghép được
  posLimitLost: 0.45,  // … nếu người đó đã khuất > 0,3 s
  appWeight: 1.6,      // trọng số khác màu áo so với khác vị trí (theo W)
  dupFrac: 0.35,       // 2 khung xương có vai cách nhau < 35% bề rộng vai = trùng
  feetMedian: 5,       // lọc trung vị vị trí chân qua 5 khung
};

/**
 * Chữ ký màu vùng thân của 1 người: trung bình màu 3 mảng (ngực trái, ngực phải, bụng) → 9 số 0..1.
 * ctx: context 2D của khung nhận diện (willReadFrequently), fw/fh: kích thước khung.
 */
export function torsoSignature(ctx, fw, fh, lm) {
  const ls = lm[LM.L_SH], rs = lm[LM.R_SH], lh = lm[LM.L_HIP], rh = lm[LM.R_HIP];
  if (!vis(ls, 0.5) || !vis(rs, 0.5)) return null;
  const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2, shW = Math.hypot((ls.x - rs.x) * fw, (ls.y - rs.y) * fh);
  const hy = vis(lh, 0.5) && vis(rh, 0.5) ? (lh.y + rh.y) / 2 : sy + (shW * 1.3) / fh;
  const pts = [[ls.x * 0.65 + rs.x * 0.35, sy + (hy - sy) * 0.25], [ls.x * 0.35 + rs.x * 0.65, sy + (hy - sy) * 0.25], [sx, sy + (hy - sy) * 0.65]];
  const half = Math.max(2, Math.round(shW * 0.12));
  const out = [];
  for (const [x, y] of pts) {
    const px = Math.round(x * fw), py = Math.round(y * fh);
    const x0 = Math.max(0, px - half), y0 = Math.max(0, py - half), w = Math.min(fw, px + half) - x0, h = Math.min(fh, py + half) - y0;
    if (w < 2 || h < 2) return null;
    const d = ctx.getImageData(x0, y0, w, h).data;
    let r = 0, g = 0, b = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    out.push(r / n / 255, g / n / 255, b / n / 255);
  }
  return out;
}
/** Khác biệt màu 0..1: chủ yếu theo sắc màu (ít phụ thuộc đèn sáng/tối) + một phần độ sáng. */
export function sigDist(a, b) {
  if (!a || !b) return null;
  let d = 0;
  for (let k = 0; k < a.length; k += 3) {
    const sa = a[k] + a[k + 1] + a[k + 2] + 1e-3, sb = b[k] + b[k + 1] + b[k + 2] + 1e-3;
    const chroma = Math.abs(a[k] / sa - b[k] / sb) + Math.abs(a[k + 1] / sa - b[k + 1] / sb) + Math.abs(a[k + 2] / sa - b[k + 2] / sb);
    d += chroma * 1.5 + Math.abs(sa - sb) / 3 * 0.5;
  }
  return Math.min(1, d / (a.length / 3));
}

/** Gán tối ưu (tổng chi phí nhỏ nhất) giữa người đang theo dõi và khung xương mới; cost[i][j] = Infinity là cấm. */
export function bestAssignment(cost, nT, nD) {
  let best = { total: Infinity, pairs: [] };
  const usedD = new Array(nD).fill(false), cur = [];
  const rec = (i, total, matched) => {
    // ưu tiên ghép được NHIỀU cặp nhất, rồi mới tới tổng chi phí nhỏ nhất
    if (i === nT) { const score = total - matched * 1000; if (score < best.total) best = { total: score, pairs: cur.slice() }; return; }
    rec(i + 1, total, matched); // người i không ghép với ai
    for (let j = 0; j < nD; j++) {
      if (usedD[j] || !isFinite(cost[i][j])) continue;
      usedD[j] = true; cur.push([i, j]); rec(i + 1, total + cost[i][j], matched + 1); cur.pop(); usedD[j] = false;
    }
  };
  rec(0, 0, 0);
  return best.pairs;
}

const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export class PlayerTracker {
  constructor(max = 4) { this.max = max; this.list = []; this.nextId = 1; this.keep = new Set(); this.dt = 0; this.tick = null; }

  /** ids trong `keep` (người đã đăng ký vào ván) được giữ chỗ lâu hơn khi tạm khuất, để quay lại vẫn đúng người. */
  setKeep(ids) { this.keep = new Set(ids); }

  /**
   * @param all     mảng landmark chuẩn hoá (0..1) của từng người MediaPipe thấy trong frame
   * @param mapper  hàm đổi toạ độ video → màn hình
   * @param sigOf   (tuỳ chọn) lm → chữ ký màu thân người (torsoSignature)
   */
  update(all, mapper, W, H, t, sigOf = null) {
    if (this.tick != null) { const d = Math.min(3000, t - this.tick); this.dt = this.dt ? this.dt * 0.9 + d * 0.1 : d; } // nhịp nhận diện
    this.tick = t;
    let dets = (all || []).map((lm, idx) => {
      const ls = lm[LM.L_SH], rs = lm[LM.R_SH];
      if (!vis(ls, 0.35) || !vis(rs, 0.35)) return null;
      const a = mapper(ls), b = mapper(rs);
      const vsum = [0, 11, 12, 23, 24, 27, 28].reduce((s, k) => s + (lm[k]?.v || 0), 0);
      return { lm, idx, c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, shW: Math.max(4, Math.hypot(a.x - b.x, a.y - b.y)), vsum };
    }).filter(Boolean);
    // khung xương trùng: giữ cái rõ hơn
    dets.sort((a, b) => b.vsum - a.vsum);
    dets = dets.filter((d, i) => !dets.slice(0, i).some(e => Math.hypot(d.c.x - e.c.x, d.c.y - e.c.y) < TRACK.dupFrac * Math.min(d.shW, e.shW)));
    if (sigOf) for (const d of dets) d.sig = sigOf(d.lm);

    // chi phí ghép: khoảng cách tới vị trí dự đoán (theo W) + khác màu áo
    const T = this.list, cost = T.map(p => dets.map(d => {
      const gone = t - p.lastSeen, lead = Math.min(gone, 300) / 1000;
      const px = p.c.x + (p.vx || 0) * lead, py = p.c.y + (p.vy || 0) * lead;
      const dp = Math.hypot(px - d.c.x, py - d.c.y) / W;
      if (dp > (gone > 300 ? TRACK.posLimitLost : TRACK.posLimit)) return Infinity;
      const ds = sigDist(p.sig, d.sig);
      return dp + (ds ?? 0.1) * TRACK.appWeight * 0.25;
    }));
    const pairs = bestAssignment(cost, T.length, dets.length);
    const usedP = new Set(), usedD = new Set();
    for (const [i, j] of pairs) { usedP.add(T[i]); usedD.add(j); this._assign(T[i], dets[j], mapper, W, H, t); }

    for (let j = 0; j < dets.length; j++) {
      if (usedD.has(j) || this.list.length >= this.max + 2) continue;
      // ưu tiên trả lại ID cho người đã đăng ký đang khuất — chọn người có màu áo giống nhất, rồi gần nhất
      const d = dets[j];
      const missing = this.list.filter(p => !usedP.has(p) && this.keep.has(p.id) && t - p.lastSeen > 300)
        .map(p => ({ p, s: (sigDist(p.sig, d.sig) ?? 0.15) * 2 + Math.hypot(p.c.x - d.c.x, p.c.y - d.c.y) / W }))
        .sort((a, b) => a.s - b.s)[0]?.p;
      const p = missing || this._new();
      usedP.add(p); this._assign(p, d, mapper, W, H, t);
    }
    const gap = gapFor(this.dt);
    for (const p of this.list) if (!usedP.has(p)) p.present = p.confirmed && t - p.lastSeen < gap; // khuất ngắn vẫn tính có mặt
    this.list = this.list.filter(p => t - p.lastSeen < (this.keep.has(p.id) ? 15000 : 1500));
    return this.list;
  }

  _new() {
    const used = new Set(this.list.map(p => p.color));
    const color = PLAYER_COLORS.find(c => !used.has(c)) || '#ffffff';
    const p = { id: this.nextId++, color, smoother: new PoseSmoother(), present: false, lastSeen: 0, firstSeen: 0, confirmed: false, c: { x: 0, y: 0 }, vx: 0, vy: 0, sig: null, sigN: 0, feetHist: [] };
    this.list.push(p);
    return p;
  }

  _assign(p, det, mapper, W, H, t) {
    // người mới (hoặc mất dấu lâu) phải xuất hiện liên tục ~0,45 s mới tính là có mặt → đồ vật lóe lên không thành "người"
    if (!p.firstSeen || (!this.keep.has(p.id) && t - p.lastSeen > gapFor(this.dt))) { p.firstSeen = t; p.confirmed = this.keep.has(p.id); }
    if (t - p.firstSeen >= CHECK.confirmMs) p.confirmed = true;
    // vận tốc (px/giây) để dự đoán vị trí khung sau
    if (p.lastSeen && t - p.lastSeen < 400) {
      const dt = Math.max(16, t - p.lastSeen) / 1000, k = 0.4;
      p.vx = (p.vx || 0) * (1 - k) + ((det.c.x - p.c.x) / dt) * k; p.vy = (p.vy || 0) * (1 - k) + ((det.c.y - p.c.y) / dt) * k;
    } else { p.vx = 0; p.vy = 0; }
    // chữ ký màu: trung bình trượt, cập nhật chậm để không "học" nhầm màu người bên cạnh khi chồng lên nhau
    if (det.sig) {
      if (!p.sig) { p.sig = det.sig.slice(); p.sigN = 1; }
      else { const k = p.sigN < 10 ? 0.3 : 0.05; p.sig = p.sig.map((v, i) => v + (det.sig[i] - v) * k); p.sigN++; }
    }
    const raw = p.smoother.apply(det.lm, t);
    const pts = raw.map(mapper);
    p.raw = raw; p.pts = pts; p.c = det.c; p.lastSeen = t; p.present = p.confirmed; p.maskIdx = det.idx;
    // Điểm chân trên sàn: giữa 2 mắt cá; không thấy chân (hoặc chân "lạc" sang người bên cạnh) thì ước lượng từ hông/vai
    const la = pts[LM.L_AN], ra = pts[LM.R_AN], lh = pts[LM.L_HIP], rh = pts[LM.R_HIP], ls = pts[LM.L_SH], rs = pts[LM.R_SH];
    const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2, shW = Math.max(4, Math.hypot(ls.x - rs.x, ls.y - rs.y));
    const hipsOk = vis(lh) && vis(rh), hx = hipsOk ? (lh.x + rh.x) / 2 : sx, hy = hipsOk ? (lh.y + rh.y) / 2 : sy + shW * 1.3;
    let f = null;
    if (vis(la) && vis(ra)) {
      const ax = (la.x + ra.x) / 2, ay = Math.max(la.y, ra.y);
      // chân hợp lệ: nằm dưới hông, không lệch ngang quá xa thân, 2 chân không dạng quá rộng
      const ok = ay > hy + shW * 0.6 && Math.abs(ax - hx) < shW * 1.1 && Math.abs(la.x - ra.x) < shW * 2.2;
      if (ok) f = { x: ax, y: ay, seen: true };
    }
    if (!f) f = hipsOk ? { x: hx, y: hy + (hy - sy) * 1.8, seen: false } : { x: sx, y: sy + shW * 3.9, seen: false };
    p.feetSeen = f.seen;
    p.feetHist.push({ x: f.x, y: f.y }); if (p.feetHist.length > TRACK.feetMedian) p.feetHist.shift();
    p.feet = { x: median(p.feetHist.map(q => q.x)), y: median(p.feetHist.map(q => q.y)) };
    const nose = pts[LM.NOSE];
    p.head = vis(nose, 0.4) ? { x: nose.x, y: nose.y } : { x: p.c.x, y: p.c.y - Math.abs(ls.x - rs.x) };
    const lw = pts[LM.L_WR], rw = pts[LM.R_WR];
    p.handsUp = vis(lw, 0.35) && vis(rw, 0.35) && lw.y < p.head.y && rw.y < p.head.y;
  }
}

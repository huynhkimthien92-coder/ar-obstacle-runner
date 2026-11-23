// Bộ dụng cụ vẽ khủng long chính diện (dùng chung cho mọi loài): màu, gradient thân, răng, mắt, mày, móng, hàm, khớp nối.
export const TAU = Math.PI * 2;
export function shade(hex, k) { // k > 0 sáng hơn, k < 0 tối hơn
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); };
export function bodyGrad(c, x, y, r, col) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.15);
  g.addColorStop(0, shade(col, 0.28)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.45));
  return g;
}
export function teethRow(c, x0, x1, y, n, len, down = true) {
  c.fillStyle = '#fff8e6'; c.strokeStyle = 'rgba(80,60,40,0.5)'; c.lineWidth = Math.max(1, len * 0.08);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n, x = x0 + (x1 - x0) * k, half = ((x1 - x0) / n) * 0.42, l = len * (0.75 + 0.35 * Math.sin(k * Math.PI));
    c.beginPath(); c.moveTo(x - half, y); c.lineTo(x, y + (down ? l : -l)); c.lineTo(x + half, y); c.closePath(); c.fill(); c.stroke();
  }
}
export function eye(c, x, y, r, glow, look = 0) {
  c.save();
  if (glow > 0) { c.shadowColor = '#ff2a00'; c.shadowBlur = r * 3 * glow; }
  ell(c, x, y, r, r * 0.8); c.fillStyle = glow > 0.4 ? '#ff4a1c' : '#ffd23f'; c.fill();
  c.shadowBlur = 0;
  ell(c, x + look * r * 0.25, y, r * 0.22, r * 0.72); c.fillStyle = '#140800'; c.fill();   // đồng tử dọc
  ell(c, x - r * 0.35, y - r * 0.3, r * 0.18, r * 0.14); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
  c.restore();
}
export function brow(c, x, y, w, side, col) { // gờ mày dữ tợn: xếch xuống phía trong
  c.beginPath(); c.moveTo(x - side * w * 0.6, y - w * 0.25); c.quadraticCurveTo(x, y - w * 0.55, x + side * w * 0.7, y + w * 0.12);
  c.lineTo(x + side * w * 0.6, y + w * 0.3); c.quadraticCurveTo(x, y - w * 0.1, x - side * w * 0.6, y + w * 0.05); c.closePath();
  c.fillStyle = shade(col, -0.35); c.fill();
}
export function claws(c, x, y, w, n, col = '#f4ecd8') {
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const cx = x + (i - (n - 1) / 2) * w * 0.38;
    c.beginPath(); c.moveTo(cx - w * 0.12, y); c.quadraticCurveTo(cx, y + w * 0.5, cx + w * 0.02, y + w * 0.45); c.lineTo(cx + w * 0.12, y); c.closePath(); c.fill();
  }
}
export function mouth(c, cx, yTop, wid, open, col, teethN, tooth) {
  // hàm trên (răng chĩa xuống) + khoang miệng + hàm dưới hạ xuống theo `open`
  const drop = open;
  if (drop > 1) {
    c.beginPath(); c.moveTo(cx - wid / 2, yTop); c.quadraticCurveTo(cx, yTop + drop * 1.5, cx + wid / 2, yTop);
    c.quadraticCurveTo(cx, yTop + drop * 0.2, cx - wid / 2, yTop); c.fillStyle = '#4a0d0d'; c.fill();
    ell(c, cx, yTop + drop * 0.65, wid * 0.28, drop * 0.3); c.fillStyle = '#b8344a'; c.fill(); // lưỡi
    teethRow(c, cx - wid * 0.44, cx + wid * 0.44, yTop + drop * 1.05, teethN - 1, tooth * 0.8, false);
  }
  teethRow(c, cx - wid * 0.46, cx + wid * 0.46, yTop, teethN, tooth, true);
  // hàm dưới
  c.beginPath(); c.moveTo(cx - wid * 0.5, yTop + drop * 0.9);
  c.quadraticCurveTo(cx, yTop + drop * 1.25 + wid * 0.32, cx + wid * 0.5, yTop + drop * 0.9);
  c.quadraticCurveTo(cx, yTop + drop * 1.1 + wid * 0.08, cx - wid * 0.5, yTop + drop * 0.9);
  c.fillStyle = shade(col, -0.15); c.fill();
}

// ---------------- Khớp nối: mỗi bộ phận cử động riêng ----------------
// A (tư thế) do dinoPose() tính: legL/legR (nhấc chân 0..1), armL/armR (giơ tay, rad), tail (−1..1 quất đuôi),
// headX/headY (dời đầu, theo w/h), headS (đầu to lên = lao về phía người xem), headRot, jaw 0..1, bob (nhún thân),
// wing (vị trí vỗ cánh −1..1), wingFold (0 xoè → 1 cụp), squint (nheo mắt khi choáng / đau), glow, look.
export const P0 = { legL: 0, legR: 0, armL: 0, armR: 0, tail: 0, headX: 0, headY: 0, headS: 1, headRot: 0, jaw: 0.15, bob: 0, wing: 0, wingFold: 0, squint: 0, glow: 0, look: 0 };
/** Biến đổi quanh điểm neo (ax, ay): dời (dx, dy) → xoay rot → thu phóng s. */
export function part(c, ax, ay, dx, dy, s, rot, fn) {
  c.save(); c.translate(ax + dx, ay + dy); if (rot) c.rotate(rot); if (s !== 1) c.scale(s, s); c.translate(-ax, -ay); fn(); c.restore();
}
export function eyes(c, xs, y, r, A, col, browW) {
  for (const sd of [-1, 1]) {
    const x = sd * xs;
    c.save(); c.translate(x, y); c.scale(1, 1 - 0.75 * A.squint); c.translate(-x, -y);
    eye(c, x, y, r, A.glow, A.look);
    c.restore();
    if (browW) brow(c, x, y - r * 1.5 - A.glow * r * 0.3, browW, -sd, col);
  }
}


// 12 loài mới, vẽ CHÍNH DIỆN bằng Canvas 2D (dáng nhận diện theo nghiên cứu — xem docs/GDD.md §3d).
// Màu: thân tông đất, lưng sẫm bụng nhạt; màu rực chỉ đặt trên cấu trúc phô diễn (mào, buồm, diềm, phiến) [suy đoán có cơ sở].
// Mọi loài dùng chung tham số tư thế A (xem dinokit P0) → biên đạo động tác dùng chung.
import { shade, ell, bodyGrad, claws, mouth, part, eyes, brow, eye } from './dinokit.js';

// ---------- khủng long ăn thịt hai chân cỡ lớn: 1 khung, nhiều kiểu đầu ----------
function legs(c, w, h, A, col, thick = 1) {
  for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) {
    part(c, sd * w * 0.2, -h * 0.42, 0, -lift * h * 0.08, 1, -sd * lift * 0.12, () => {
      ell(c, sd * w * 0.19, -h * 0.31, w * 0.12 * thick, h * 0.15); c.fillStyle = bodyGrad(c, sd * w * 0.19, -h * 0.31, w * 0.12, col); c.fill();
      c.beginPath(); c.moveTo(sd * w * 0.15, -h * 0.22); c.lineTo(sd * w * (0.15 + 0.1 * thick), -h * 0.22); c.lineTo(sd * w * (0.15 + 0.09 * thick), -h * 0.03); c.lineTo(sd * w * 0.16, -h * 0.03); c.closePath();
      c.fillStyle = shade(col, -0.2); c.fill();
      ell(c, sd * w * 0.2, -h * 0.025, w * 0.09, h * 0.03); c.fillStyle = shade(col, -0.3); c.fill();
      claws(c, sd * w * 0.2, -h * 0.01, w * 0.06, 3);
    });
  }
}
function theropod(c, w, h, A, S) {
  const col = S.col, belly = S.belly;
  if (S.sail) { // buồm lưng (nhìn chính diện thấy gần như cạnh buồm; khi phô buồm nó quay ngang → buồm mở rộng)
    const open = A.sailOpen || 0, sw = w * (0.24 + 0.45 * open), top = -h * (1.15 + 0.05 * open);
    const g = c.createLinearGradient(0, top, 0, -h * 0.6); g.addColorStop(0, '#ffcf4a'); g.addColorStop(0.45, '#e8542f'); g.addColorStop(1, shade(col, -0.2));
    c.beginPath(); c.moveTo(-sw, -h * 0.6); c.quadraticCurveTo(-sw * 1.05, top * 0.95, 0, top); c.quadraticCurveTo(sw * 1.05, top * 0.95, sw, -h * 0.6); c.closePath(); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(90,30,10,0.45)'; c.lineWidth = w * 0.01;
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * sw * 0.28, -h * 0.62); c.lineTo(i * sw * 0.22, top * (0.97 - Math.abs(i) * 0.06)); c.stroke(); }
  }
  const tx = w * (0.55 + 0.25 * Math.abs(A.tail)) * (A.tail < 0 ? -1 : 1), ty = -h * (0.24 - 0.12 * Math.abs(A.tail));
  c.beginPath(); c.moveTo(Math.sign(tx) * w * 0.12, -h * 0.52); c.quadraticCurveTo(tx * 0.75, -h * 0.5, tx, ty);
  c.quadraticCurveTo(tx * 0.7, -h * 0.3, Math.sign(tx) * w * 0.1, -h * 0.34); c.closePath(); c.fillStyle = shade(col, -0.3); c.fill();
  legs(c, w, h, A, col, S.slim ? 0.8 : 1);
  part(c, 0, -h * 0.3, 0, -A.bob * h, 1, 0, () => {
    const bw = w * (S.slim ? 0.25 : 0.3);
    ell(c, 0, -h * 0.48, bw, h * 0.23); c.fillStyle = bodyGrad(c, 0, -h * 0.48, bw, col); c.fill();
    if (S.stripe) { c.strokeStyle = S.stripe; c.lineWidth = w * 0.022; for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sd * bw * 0.95, -h * (0.4 + i * 0.06)); c.quadraticCurveTo(sd * bw * 0.75, -h * (0.43 + i * 0.06), sd * bw * 0.6, -h * (0.42 + i * 0.06)); c.stroke(); } }
    if (S.bumps) { c.fillStyle = shade(col, 0.18); for (let i = 0; i < 10; i++) { const a = i * 2.4; ell(c, Math.cos(a) * bw * 0.75, -h * (0.48 + Math.sin(a) * 0.16), w * 0.018, w * 0.018); c.fill(); } } // "vảy nổi" Carnotaurus [BC]
    ell(c, 0, -h * 0.45, bw * 0.55, h * 0.17); c.fillStyle = belly; c.fill();
    // tay: dài 3 vuốt (Allosaurus), ngắn (Dilo), vuốt cái to (Spinosaurus), gần như không có (Carnotaurus)
    const al = S.arms === 'long' ? 1.6 : S.arms === 'tiny' ? 0.45 : 1;
    for (const [sd, ar] of [[-1, A.armL], [1, A.armR]]) part(c, sd * w * 0.16, -h * 0.6, 0, 0, 1, -sd * ar, () => {
      c.strokeStyle = shade(col, -0.1); c.lineWidth = w * 0.045; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sd * w * 0.16, -h * 0.6); c.lineTo(sd * w * (0.16 + 0.08 * al), -h * (0.6 - 0.05 * al)); c.lineTo(sd * w * (0.15 + 0.06 * al), -h * (0.6 - 0.11 * al)); c.stroke();
      if (al > 0.5) claws(c, sd * w * (0.15 + 0.06 * al), -h * (0.6 - 0.11 * al), w * (S.thumb ? 0.07 : 0.04) * al, S.arms === 'long' ? 3 : 2);
    });
    c.beginPath(); c.moveTo(-w * 0.14, -h * 0.62); c.lineTo(-w * 0.11 + A.headX * w * 0.5, -h * 0.76 + A.headY * h * 0.5); c.lineTo(w * 0.11 + A.headX * w * 0.5, -h * 0.76 + A.headY * h * 0.5); c.lineTo(w * 0.14, -h * 0.62); c.closePath();
    c.fillStyle = col; c.fill();
    part(c, 0, -h * 0.75, A.headX * w, A.headY * h, A.headS, A.headRot, () => S.head(c, w, h, A, S));
  });
}
// --- các kiểu đầu ---
function headAllo(c, w, h, A, S) { // đầu hẹp & cao, 2 sừng nhỏ trên mắt, gờ mũi
  const hy = -h * 0.85, hw = w * 0.34, hh = h * 0.19, col = S.col;
  c.beginPath(); c.moveTo(-hw / 2, hy + hh * 0.3); c.quadraticCurveTo(-hw * 0.55, hy - hh * 0.55, -hw * 0.15, hy - hh * 0.75);
  c.lineTo(hw * 0.15, hy - hh * 0.75); c.quadraticCurveTo(hw * 0.55, hy - hh * 0.55, hw / 2, hy + hh * 0.3); c.quadraticCurveTo(0, hy + hh * 0.5, -hw / 2, hy + hh * 0.3);
  c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
  c.fillStyle = '#c0442a'; for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * hw * 0.22, hy - hh * 0.62); c.lineTo(sd * hw * 0.32, hy - hh * (1.05 + A.glow * 0.1)); c.lineTo(sd * hw * 0.4, hy - hh * 0.55); c.fill(); } // sừng mày đỏ
  c.strokeStyle = shade(col, -0.35); c.lineWidth = w * 0.012; c.beginPath(); c.moveTo(-hw * 0.08, hy - hh * 0.7); c.lineTo(-hw * 0.06, hy); c.moveTo(hw * 0.08, hy - hh * 0.7); c.lineTo(hw * 0.06, hy); c.stroke();
  eyes(c, hw * 0.33, hy - hh * 0.38, hw * 0.08, A, col, hw * 0.14);
  mouth(c, 0, hy + hh * 0.3, hw * 0.92, A.jaw * h * 0.2, col, 9, hh * 0.24); // há rất rộng
}
function headCarno(c, w, h, A, S) { // mặt ngắn như bò tót, 2 sừng dày chĩa ngang
  const hy = -h * 0.84, hw = w * 0.42, hh = h * 0.14, col = S.col;
  const hg = c.createLinearGradient(0, hy - hh, 0, hy - hh * 2); hg.addColorStop(0, '#6b4a2e'); hg.addColorStop(1, '#e8d8b0');
  for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * hw * 0.18, hy - hh * 0.7); c.quadraticCurveTo(sd * hw * 0.5, hy - hh * 1.2, sd * hw * 0.62, hy - hh * (1.9 + A.glow * 0.15)); c.quadraticCurveTo(sd * hw * 0.42, hy - hh * 0.95, sd * hw * 0.38, hy - hh * 0.5); c.fillStyle = hg; c.fill(); }
  c.beginPath(); c.moveTo(-hw / 2, hy + hh * 0.4); c.quadraticCurveTo(-hw * 0.55, hy - hh * 0.8, 0, hy - hh * 0.85); c.quadraticCurveTo(hw * 0.55, hy - hh * 0.8, hw / 2, hy + hh * 0.4);
  c.quadraticCurveTo(0, hy + hh * 0.55, -hw / 2, hy + hh * 0.4); c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
  c.fillStyle = shade(col, 0.15); for (let i = 0; i < 8; i++) { ell(c, (i - 3.5) * hw * 0.1, hy - hh * (0.2 + 0.25 * (i % 2)), w * 0.014, w * 0.014); c.fill(); }
  eyes(c, hw * 0.3, hy - hh * 0.35, hw * 0.07, A, col, hw * 0.13);
  mouth(c, 0, hy + hh * 0.4, hw * 0.9, A.jaw * h * 0.12, col, 10, hh * 0.25);
}
function headDilo(c, w, h, A, S) { // đầu mảnh, 2 mào song song chữ "II" (đổi màu khi phô), khấc ở hàm trên
  const hy = -h * 0.86, hw = w * 0.3, hh = h * 0.15, col = S.col;
  const cg = A.glow > 0.3 ? '#ff4d6d' : '#e8a13a';
  for (const sd of [-1, 1]) {
    const g = c.createLinearGradient(0, hy - hh * 0.6, 0, hy - hh * 2.3); g.addColorStop(0, cg); g.addColorStop(1, '#fff1a8');
    c.beginPath(); c.moveTo(sd * hw * 0.06, hy - hh * 0.6); c.quadraticCurveTo(sd * hw * 0.14, hy - hh * (2.3 + A.glow * 0.3), sd * hw * 0.26, hy - hh * (2.1 + A.glow * 0.3)); c.lineTo(sd * hw * 0.2, hy - hh * 0.55); c.closePath();
    c.fillStyle = g; c.fill();
  }
  c.beginPath(); c.moveTo(-hw / 2, hy); c.quadraticCurveTo(-hw * 0.5, hy - hh * 0.8, 0, hy - hh * 0.8); c.quadraticCurveTo(hw * 0.5, hy - hh * 0.8, hw / 2, hy);
  c.lineTo(hw * 0.32, hy + hh * 0.55); c.quadraticCurveTo(0, hy + hh * 0.7, -hw * 0.32, hy + hh * 0.55); c.closePath(); c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
  c.fillStyle = shade(col, -0.4); for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * hw * 0.42, hy + hh * 0.2); c.lineTo(sd * hw * 0.32, hy + hh * 0.3); c.lineTo(sd * hw * 0.4, hy + hh * 0.38); c.fill(); } // khấc hàm
  eyes(c, hw * 0.3, hy - hh * 0.3, hw * 0.085, A, col, hw * 0.13);
  mouth(c, 0, hy + hh * 0.55, hw * 0.62, A.jaw * h * 0.12, col, 8, hh * 0.25);
  if (A.myth > 0) { // gag "diềm phim ảnh" bật ra rồi xẹp — HUYỀN THOẠI
    const k = A.myth, r = hw * (0.6 + 0.9 * k);
    c.save(); c.globalAlpha = 0.85 * Math.min(1, k * 2);
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * hw * 0.35, hy + hh * 0.4); c.quadraticCurveTo(sd * r, hy - hh * 0.5, sd * r * 0.85, hy + hh * 1.6); c.closePath(); c.fillStyle = sd < 0 ? '#ffd23f' : '#ff7b2c'; c.fill(); }
    c.restore();
  }
}
function headSpino(c, w, h, A, S) { // mõm dài hẹp như mũi giáo chĩa vào người xem (nhìn chính diện: hình giọt nước dọc)
  const hy = -h * 0.84, hw = w * 0.24, hh = h * 0.24, col = S.col;
  c.beginPath(); c.moveTo(-hw / 2, hy - hh * 0.35); c.quadraticCurveTo(-hw * 0.5, hy - hh * 0.75, 0, hy - hh * 0.72); c.quadraticCurveTo(hw * 0.5, hy - hh * 0.75, hw / 2, hy - hh * 0.35);
  c.lineTo(hw * 0.2, hy + hh * 0.45); c.quadraticCurveTo(0, hy + hh * 0.6, -hw * 0.2, hy + hh * 0.45); c.closePath(); c.fillStyle = bodyGrad(c, 0, hy, hw * 0.6, col); c.fill();
  c.fillStyle = '#d4573a'; ell(c, 0, hy - hh * 0.62, hw * 0.12, hh * 0.08); c.fill(); // gờ mào nhỏ
  ell(c, -hw * 0.06, hy - hh * 0.35, hw * 0.025, hh * 0.035); c.fillStyle = '#1b1208'; c.fill(); ell(c, hw * 0.06, hy - hh * 0.35, hw * 0.025, hh * 0.035); c.fill(); // lỗ mũi lùi cao
  eyes(c, hw * 0.36, hy - hh * 0.5, hw * 0.09, A, col, hw * 0.12);
  // răng nón đan cài (bắt cá) ở đầu mõm
  c.fillStyle = '#fff8e6';
  for (let i = 0; i < 5; i++) { const x = (i - 2) * hw * 0.09; c.beginPath(); c.moveTo(x - hw * 0.025, hy + hh * 0.35); c.lineTo(x, hy + hh * (0.48 + (i % 2) * 0.05)); c.lineTo(x + hw * 0.025, hy + hh * 0.35); c.fill(); }
  mouth(c, 0, hy + hh * 0.42, hw * 0.42, A.jaw * h * 0.1, col, 5, hh * 0.1);
}
const STYLE = {
  allo: { col: '#b07a45', belly: '#ead2a0', stripe: '#5a3a1e', arms: 'long', head: headAllo },
  carno: { col: '#9c3b2a', belly: '#d9b28a', bumps: true, arms: 'tiny', head: headCarno, slim: true },
  dilo: { col: '#6f8a3a', belly: '#e6dca0', stripe: '#3f5320', arms: 'normal', head: headDilo, slim: true },
  spino: { col: '#6b6a52', belly: '#d8cfa8', arms: 'normal', thumb: true, sail: true, head: headSpino },
};
const allo = (c, w, h, A) => theropod(c, w, h, A, STYLE.allo);
const carno = (c, w, h, A) => theropod(c, w, h, A, STYLE.carno);
const dilo = (c, w, h, A) => theropod(c, w, h, A, STYLE.dilo);
const spino = (c, w, h, A) => theropod(c, w, h, A, STYLE.spino);

// ---------- STEGOSAURUS: phiến dựng so le phía sau, đầu nhỏ thấp, đuôi 4 gai ló ra một bên ----------
function stego(c, w, h, A) {
  const col = '#7c8a4a', plate = A.glow > 0.3 ? '#ff6a3d' : '#d9893a';
  // đuôi + gai (thagomizer) ló ra phía A.tail
  const sd = A.tail < 0 ? -1 : 1, tk = 0.5 + 0.5 * Math.abs(A.tail), tx = sd * w * (0.45 + 0.2 * tk), ty = -h * (0.35 + 0.15 * tk);
  c.beginPath(); c.moveTo(sd * w * 0.25, -h * 0.5); c.quadraticCurveTo(sd * w * 0.4, -h * 0.5, tx, ty); c.lineTo(tx, ty + h * 0.08); c.quadraticCurveTo(sd * w * 0.35, -h * 0.35, sd * w * 0.22, -h * 0.35); c.fillStyle = shade(col, -0.25); c.fill();
  if (!A.broken?.spikes) { c.fillStyle = '#efe6cf'; for (let i = 0; i < 4; i++) { const a = -0.9 + i * 0.6; c.beginPath(); c.moveTo(tx - w * 0.01, ty + h * 0.04); c.lineTo(tx + Math.cos(a) * w * 0.12 * sd, ty + Math.sin(a) * h * 0.14); c.lineTo(tx + w * 0.015, ty + h * 0.05); c.fill(); } }
  // phiến lưng: 2 hàng so le, to dần về giữa
  for (let i = -3; i <= 3; i++) {
    const k = 1 - Math.abs(i) / 4, x = i * w * 0.085, base = -h * (0.72 + 0.04 * k), top = base - h * (0.18 + 0.34 * k);
    const g = c.createLinearGradient(0, top, 0, base); g.addColorStop(0, plate); g.addColorStop(1, shade(col, -0.2));
    c.beginPath(); c.moveTo(x - w * 0.05 * (0.6 + k), base); c.quadraticCurveTo(x - w * 0.06, (top + base) / 2, x + (i % 2 ? 1 : -1) * w * 0.01, top); c.quadraticCurveTo(x + w * 0.06, (top + base) / 2, x + w * 0.05 * (0.6 + k), base); c.closePath();
    c.fillStyle = g; c.fill(); c.strokeStyle = shade(col, -0.4); c.lineWidth = w * 0.004; c.stroke();
  }
  part(c, 0, -h * 0.3, 0, -A.bob * h, 1, 0, () => {
    ell(c, 0, -h * 0.5, w * 0.36, h * 0.27); c.fillStyle = bodyGrad(c, 0, -h * 0.5, w * 0.36, col); c.fill();
    c.fillStyle = shade(col, -0.25); for (let i = 0; i < 12; i++) { const a = i * 2.1; ell(c, Math.cos(a) * w * 0.25, -h * (0.5 + Math.sin(a) * 0.15), w * 0.02, h * 0.015); c.fill(); }
  });
  for (const [s2, lift] of [[-1, A.legL], [1, A.legR]]) part(c, s2 * w * 0.2, -h * 0.3, 0, -lift * h * 0.07, 1, 0, () => {
    c.beginPath(); c.moveTo(s2 * w * 0.13, -h * 0.34); c.lineTo(s2 * w * 0.26, -h * 0.34); c.lineTo(s2 * w * 0.25, -h * 0.03); c.lineTo(s2 * w * 0.14, -h * 0.03); c.closePath();
    c.fillStyle = bodyGrad(c, s2 * w * 0.2, -h * 0.2, w * 0.1, col); c.fill(); claws(c, s2 * w * 0.195, -h * 0.02, w * 0.04, 3, '#e8e0cc');
  });
  // đầu nhỏ, thấp, mỏ
  part(c, 0, -h * 0.32, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
    c.strokeStyle = col; c.lineWidth = w * 0.08; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -h * 0.4); c.lineTo(0, -h * 0.26); c.stroke();
    ell(c, 0, -h * 0.24, w * 0.08, h * 0.08); c.fillStyle = bodyGrad(c, 0, -h * 0.24, w * 0.08, col); c.fill();
    c.fillStyle = '#4a4436'; c.beginPath(); c.moveTo(-w * 0.03, -h * 0.19); c.lineTo(w * 0.03, -h * 0.19); c.lineTo(0, -h * (0.14 - A.jaw * 0.02)); c.fill();
    eyes(c, w * 0.045, -h * 0.26, w * 0.016, A, col, 0);
  });
}

// ---------- ANKYLOSAURUS: thấp, rộng, giáp osteoderm + gai sườn, chùy đuôi ló bên hông ----------
function ankylo(c, w, h, A) {
  const col = '#8a6a44';
  const sd = A.tail < 0 ? -1 : 1, tk = Math.abs(A.tail), cx = sd * w * (0.5 + 0.12 * tk), cy = -h * (0.32 - 0.05 * tk);
  c.strokeStyle = shade(col, -0.25); c.lineWidth = h * 0.1; c.lineCap = 'round';
  c.beginPath(); c.moveTo(sd * w * 0.3, -h * 0.4); c.quadraticCurveTo(sd * w * 0.42, -h * 0.36, cx, cy); c.stroke();
  ell(c, cx, cy, w * 0.07, h * 0.12); c.fillStyle = bodyGrad(c, cx, cy, w * 0.07, '#6e5434'); c.fill(); // chùy đuôi
  ell(c, cx - sd * w * 0.04, cy, w * 0.045, h * 0.09); c.fillStyle = bodyGrad(c, cx, cy, w * 0.05, '#6e5434'); c.fill();
  part(c, 0, -h * 0.3, 0, -A.bob * h, 1, 0, () => {
    // gai sườn
    c.fillStyle = '#d8c8a0';
    for (const s2 of [-1, 1]) for (let i = 0; i < 5; i++) { const y = -h * (0.32 + i * 0.1); c.beginPath(); c.moveTo(s2 * w * 0.4, y - h * 0.03); c.lineTo(s2 * w * (0.5 + 0.02 * (i % 2)), y); c.lineTo(s2 * w * 0.4, y + h * 0.03); c.fill(); }
    ell(c, 0, -h * 0.55, w * 0.44, h * 0.38); c.fillStyle = bodyGrad(c, 0, -h * 0.55, w * 0.44, col); c.fill();
    for (let r = 0; r < 4; r++) for (let i = 0; i < 7 - r; i++) { // hàng osteoderm
      const x = (i - (6 - r) / 2) * w * 0.11, y = -h * (0.82 - r * 0.12);
      ell(c, x, y, w * 0.04, h * 0.05); c.fillStyle = shade(col, 0.15); c.fill(); c.strokeStyle = shade(col, -0.35); c.lineWidth = w * 0.006; c.stroke();
    }
  });
  for (const [s2, lift] of [[-1, A.legL], [1, A.legR]]) part(c, s2 * w * 0.26, -h * 0.22, 0, -lift * h * 0.08, 1, 0, () => {
    c.beginPath(); c.moveTo(s2 * w * 0.19, -h * 0.25); c.lineTo(s2 * w * 0.33, -h * 0.25); c.lineTo(s2 * w * 0.32, -h * 0.03); c.lineTo(s2 * w * 0.2, -h * 0.03); c.closePath();
    c.fillStyle = bodyGrad(c, s2 * w * 0.26, -h * 0.15, w * 0.08, col); c.fill(); claws(c, s2 * w * 0.26, -h * 0.02, w * 0.04, 3, '#e8e0cc');
  });
  part(c, 0, -h * 0.28, A.headX * w, A.headY * h, A.headS, A.headRot, () => { // đầu tam giác rộng, sừng góc sau, mỏ
    c.beginPath(); c.moveTo(-w * 0.14, -h * 0.42); c.lineTo(w * 0.14, -h * 0.42); c.lineTo(w * 0.08, -h * 0.14); c.lineTo(-w * 0.08, -h * 0.14); c.closePath();
    c.fillStyle = bodyGrad(c, 0, -h * 0.3, w * 0.14, col); c.fill();
    c.fillStyle = '#e0d2ac'; for (const s2 of [-1, 1]) { c.beginPath(); c.moveTo(s2 * w * 0.12, -h * 0.42); c.lineTo(s2 * w * 0.19, -h * 0.47); c.lineTo(s2 * w * 0.14, -h * 0.36); c.fill(); }
    c.fillStyle = '#3d3a36'; c.beginPath(); c.moveTo(-w * 0.05, -h * 0.17); c.lineTo(w * 0.05, -h * 0.17); c.lineTo(0, -h * (0.1 - A.jaw * 0.03)); c.fill();
    eyes(c, w * 0.07, -h * 0.33, w * 0.02, A, col, 0);
  });
}

// ---------- PARASAUROLOPHUS: mỏ vịt rộng, mào ống dài quặt ra sau ----------
function parasaur(c, w, h, A) {
  const col = '#5f7f72', crest = A.glow > 0.3 ? '#ff7b2c' : '#d0632e';
  const tx = w * 0.5 * (A.tail < 0 ? -1 : 1);
  c.beginPath(); c.moveTo(Math.sign(tx) * w * 0.1, -h * 0.5); c.quadraticCurveTo(tx * 0.8, -h * 0.5, tx, -h * 0.38); c.quadraticCurveTo(tx * 0.7, -h * 0.34, Math.sign(tx) * w * 0.1, -h * 0.36); c.fillStyle = shade(col, -0.3); c.fill();
  for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) part(c, sd * w * 0.2, -h * 0.42, 0, -lift * h * 0.08, 1, -sd * lift * 0.1, () => {
    ell(c, sd * w * 0.19, -h * 0.32, w * 0.13, h * 0.15); c.fillStyle = bodyGrad(c, sd * w * 0.19, -h * 0.32, w * 0.13, col); c.fill();
    c.fillStyle = shade(col, -0.2); c.fillRect(sd * w * 0.2 - w * 0.05, -h * 0.22, w * 0.1, h * 0.19);
    ell(c, sd * w * 0.2, -h * 0.025, w * 0.08, h * 0.03); c.fillStyle = '#3a3a30'; c.fill(); // móng guốc
  });
  part(c, 0, -h * 0.3, 0, -A.bob * h, 1, 0, () => {
    ell(c, 0, -h * 0.5, w * 0.3, h * 0.24); c.fillStyle = bodyGrad(c, 0, -h * 0.5, w * 0.3, col); c.fill();
    c.strokeStyle = shade(col, -0.3); c.lineWidth = w * 0.02; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-w * 0.25, -h * (0.42 + i * 0.06)); c.quadraticCurveTo(0, -h * (0.4 + i * 0.06), w * 0.25, -h * (0.42 + i * 0.06)); c.stroke(); }
    ell(c, 0, -h * 0.46, w * 0.15, h * 0.16); c.fillStyle = '#d9d2b0'; c.fill();
    for (const [sd, ar] of [[-1, A.armL], [1, A.armR]]) part(c, sd * w * 0.15, -h * 0.6, 0, 0, 1, -sd * ar, () => {
      c.strokeStyle = col; c.lineWidth = w * 0.05; c.lineCap = 'round'; c.beginPath(); c.moveTo(sd * w * 0.15, -h * 0.6); c.lineTo(sd * w * 0.22, -h * 0.48); c.stroke();
    });
    c.strokeStyle = col; c.lineWidth = w * 0.13; c.beginPath(); c.moveTo(0, -h * 0.64); c.lineTo(A.headX * w, -h * 0.74 + A.headY * h); c.stroke();
    part(c, 0, -h * 0.74, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
      const hy = -h * 0.8;
      // mào ống: từ đỉnh đầu vươn lên rồi quặt ra sau (nhìn chính diện: ống nghiêng)
      c.strokeStyle = crest; c.lineWidth = w * 0.07; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, hy - h * 0.06); c.quadraticCurveTo(w * 0.02, hy - h * 0.28, w * 0.14, hy - h * 0.36); c.stroke();
      c.strokeStyle = shade(crest, 0.3); c.lineWidth = w * 0.02; c.beginPath(); c.moveTo(-w * 0.01, hy - h * 0.08); c.quadraticCurveTo(w * 0.01, hy - h * 0.27, w * 0.12, hy - h * 0.34); c.stroke();
      ell(c, 0, hy, w * 0.13, h * 0.08); c.fillStyle = bodyGrad(c, 0, hy, w * 0.13, col); c.fill();
      eyes(c, w * 0.09, hy - h * 0.02, w * 0.025, A, col, 0);
      // mỏ vịt dẹt, rộng
      c.beginPath(); c.ellipse(0, hy + h * 0.07, w * 0.12, h * (0.035 + A.jaw * 0.03), 0, 0, Math.PI * 2); c.fillStyle = '#c9b07a'; c.fill();
      if (A.jaw > 0.1) { ell(c, 0, hy + h * 0.075, w * 0.09, h * A.jaw * 0.022); c.fillStyle = '#4a0d0d'; c.fill(); }
    });
  });
}

// ---------- DEINOSUCHUS: chỉ mắt + lỗ mũi nổi; khi lao lên thì mõm rộng há răng ----------
function deino(c, w, h, A) {
  const col = '#4f5a3a';
  part(c, 0, -h * 0.4, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
    // lưng gai dưới nước
    c.fillStyle = shade(col, -0.3); for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * w * 0.08 - w * 0.025, -h * 0.25); c.lineTo(i * w * 0.08, -h * 0.33); c.lineTo(i * w * 0.08 + w * 0.025, -h * 0.25); c.fill(); }
    // mõm rộng hình chữ U, đầu mõm phình
    const open = A.jaw, top = -h * (0.55 + open * 0.25);
    c.beginPath(); c.moveTo(-w * 0.32, -h * 0.4); c.quadraticCurveTo(-w * 0.35, top, 0, top - h * 0.05); c.quadraticCurveTo(w * 0.35, top, w * 0.32, -h * 0.4); c.closePath();
    c.fillStyle = bodyGrad(c, 0, -h * 0.5, w * 0.35, col); c.fill();
    if (open > 0.1) {
      c.beginPath(); c.moveTo(-w * 0.28, -h * 0.4); c.quadraticCurveTo(0, top + h * 0.12, w * 0.28, -h * 0.4); c.quadraticCurveTo(0, -h * 0.3, -w * 0.28, -h * 0.4); c.fillStyle = '#8a2a2a'; c.fill();
      c.fillStyle = '#fff2d0'; for (let i = 0; i < 12; i++) { const k = i / 11, x = -w * 0.26 + k * w * 0.52, y = -h * 0.4 - Math.sin(k * Math.PI) * (h * 0.4 + top) * -0.75; c.beginPath(); c.moveTo(x - w * 0.012, y); c.lineTo(x, y + h * 0.05); c.lineTo(x + w * 0.012, y); c.fill(); }
    }
    for (const sd of [-1, 1]) { // ụ mắt
      ell(c, sd * w * 0.15, top + h * 0.02, w * 0.06, h * 0.06); c.fillStyle = shade(col, 0.1); c.fill();
      eye(c, sd * w * 0.15, top + h * 0.01, w * 0.03, A.glow, A.look);
    }
    ell(c, 0, top - h * 0.02, w * 0.06, h * 0.03); c.fillStyle = shade(col, 0.15); c.fill(); // ụ lỗ mũi
    ell(c, -w * 0.02, top - h * 0.025, w * 0.008, h * 0.008); c.fillStyle = '#111'; c.fill(); ell(c, w * 0.02, top - h * 0.025, w * 0.008, h * 0.008); c.fill();
  });
}

// ---------- MOSASAURUS: đầu kỳ đà khổng lồ trồi khỏi nước, vây chèo 2 bên, vây đuôi 2 thuỳ ----------
function mosa(c, w, h, A) {
  const col = '#2f4a5e', belly = '#d9e2e0';
  if (Math.abs(A.tail) > 0.6) { // vây đuôi hai thuỳ (như cá mập) nhô lên khi quật
    const sd = A.tail < 0 ? -1 : 1, x = sd * w * 0.55, y = -h * (0.4 + 0.25 * (Math.abs(A.tail) - 0.6));
    c.fillStyle = shade(col, -0.2); c.beginPath(); c.moveTo(x, y + h * 0.15); c.lineTo(x - sd * w * 0.05, y - h * 0.2); c.lineTo(x + sd * w * 0.02, y); c.lineTo(x + sd * w * 0.14, y - h * 0.12); c.closePath(); c.fill();
  }
  for (const [sd, ar] of [[-1, A.armL], [1, A.armR]]) part(c, sd * w * 0.25, -h * 0.4, 0, 0, 1, -sd * (ar * 0.6 - 0.2), () => { // vây chèo
    ell(c, sd * w * 0.38, -h * 0.38, w * 0.15, h * 0.05, sd * 0.4); c.fillStyle = shade(col, -0.1); c.fill();
  });
  part(c, 0, -h * 0.3, A.headX * w, A.headY * h - A.bob * h, A.headS, A.headRot, () => {
    ell(c, 0, -h * 0.45, w * 0.3, h * 0.25); c.fillStyle = bodyGrad(c, 0, -h * 0.45, w * 0.3, col); c.fill();
    ell(c, 0, -h * 0.4, w * 0.17, h * 0.17); c.fillStyle = belly; c.fill(); // cổ họng / bụng sáng màu [BC: lưng tối bụng sáng]
    const hy = -h * 0.78, hw = w * 0.42, hh = h * 0.2;
    c.beginPath(); c.moveTo(-hw / 2, hy + hh * 0.2); c.quadraticCurveTo(-hw * 0.5, hy - hh * 0.7, 0, hy - hh * 0.75); c.quadraticCurveTo(hw * 0.5, hy - hh * 0.7, hw / 2, hy + hh * 0.2);
    c.quadraticCurveTo(0, hy + hh * 0.45, -hw / 2, hy + hh * 0.2); c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
    eyes(c, hw * 0.36, hy - hh * 0.35, hw * 0.07, A, col, hw * 0.1);
    mouth(c, 0, hy + hh * 0.2, hw * 0.88, A.jaw * h * 0.2, col, 11, hh * 0.22); // hàm dưới có khớp phụ → mở rất rộng
  });
}

// ---------- QUETZALCOATLUS: đi 4 chân (cánh gập làm chân trước), cổ dài thẳng, mỏ khổng lồ chĩa vào người xem ----------
function quetzal(c, w, h, A) {
  const col = '#c9b9a0', mem = '#7a5a6a';
  const spread = A.wingOpen || 0;
  for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) { // chi trước = cánh gập, chống đất (hoặc xoè ra khi cất cánh)
    part(c, sd * w * 0.12, -h * 0.5, 0, -lift * h * 0.06, 1, 0, () => {
      c.strokeStyle = shade(col, -0.25); c.lineWidth = w * 0.035; c.lineCap = 'round';
      const ex = sd * w * (0.3 + 0.25 * spread), ey = -h * (0.55 + 0.25 * spread), fx = sd * w * (0.34 + 0.2 * spread), fy = spread > 0.5 ? -h * 0.75 : -h * 0.02;
      c.beginPath(); c.moveTo(sd * w * 0.1, -h * 0.5); c.lineTo(ex, ey); c.lineTo(fx, fy); c.stroke();
      c.fillStyle = mem; c.globalAlpha = 0.8; c.beginPath(); c.moveTo(sd * w * 0.1, -h * 0.5); c.lineTo(ex, ey); c.lineTo(fx, fy); c.lineTo(sd * w * 0.12, -h * 0.36); c.fill(); c.globalAlpha = 1;
      claws(c, ex, ey, w * 0.03, 3);
    });
  }
  for (const sd of [-1, 1]) { c.strokeStyle = shade(col, -0.2); c.lineWidth = w * 0.03; c.beginPath(); c.moveTo(sd * w * 0.05, -h * 0.38); c.lineTo(sd * w * 0.08, -h * 0.03); c.stroke(); claws(c, sd * w * 0.08, -h * 0.02, w * 0.03, 3); }
  part(c, 0, -h * 0.4, 0, -A.bob * h, 1, 0, () => {
    ell(c, 0, -h * 0.45, w * 0.1, h * 0.1); c.fillStyle = bodyGrad(c, 0, -h * 0.45, w * 0.1, col); c.fill();
    c.strokeStyle = col; c.lineWidth = w * 0.06; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -h * 0.5); c.lineTo(A.headX * w, -h * 0.82 + A.headY * h); c.stroke(); // cổ dài thẳng, cứng
    part(c, 0, -h * 0.82, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
      const hy = -h * 0.86;
      c.fillStyle = '#e8543b'; c.beginPath(); c.moveTo(-w * 0.03, hy - h * 0.03); c.quadraticCurveTo(0, hy - h * 0.12, w * 0.05, hy - h * 0.1); c.lineTo(w * 0.03, hy - h * 0.02); c.fill(); // mào nhỏ
      ell(c, 0, hy, w * 0.1, h * 0.06); c.fillStyle = bodyGrad(c, 0, hy, w * 0.1, col); c.fill();
      // mỏ dài ~2 m chĩa thẳng vào camera → thấy như tam giác dài hướng xuống
      const bg = c.createLinearGradient(0, hy, 0, hy + h * 0.24); bg.addColorStop(0, '#e9d9a8'); bg.addColorStop(1, '#6b5a3a');
      for (const sd of [-1, 1]) { const o = sd * A.jaw * w * 0.03; c.beginPath(); c.moveTo(o, hy + h * 0.02); c.lineTo(sd * w * 0.075 + o, hy + h * 0.02); c.lineTo(o * 1.6, hy + h * 0.32); c.closePath(); c.fillStyle = bg; c.fill(); }
      eyes(c, w * 0.05, hy - h * 0.01, w * 0.014, A, col, 0);
    });
  });
}

// ---------- con nhỏ dùng lại khung raptor (đổi màu / đầu) ----------
export const PAL = {
  compy: { col: '#6b5236', dark: '#2a1c10', belly: '#e9dcc0', wing: '#4a3a28', crest: null, mask: 'rgba(20,12,6,0.85)', stripes: '#2a1c10', eyeR: 0.12 },
  pachy: { col: '#7d6a4f', dark: '#3a2c1c', belly: '#d9c9a0', wing: '#5a4a34', dome: '#c9b089' },
};
export const SPECIES_DRAW = { allo, carno, dilo, spino, stego, ankylo, parasaur, deino, mosa, quetzal };

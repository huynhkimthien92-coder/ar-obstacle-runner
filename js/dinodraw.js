// Vẽ khủng long NHÌN THẲNG vào màn hình (góc chính diện) bằng Canvas 2D thuần — không cần ảnh, không tốn băng thông.
// Toạ độ cục bộ: gốc (0,0) ở giữa 2 chân, trục y hướng LÊN là âm; w, h = khung khủng long (dinoBox).
// Mỗi bộ phận (chân, tay, đầu, hàm, đuôi, cánh) cử động riêng theo tư thế do dinoPose() tính cho từng giai đoạn / đòn.

import { TAU, shade, ell, bodyGrad, teethRow, eye, brow, claws, mouth, P0, part, eyes } from './dinokit.js';
export { shade } from './dinokit.js';
import { SPECIES_DRAW, PAL } from './dinospecies.js';

// ---------------- T-REX ----------------
function trex(c, w, h, A) {
  const col = '#5b8a3a', belly = '#d8c58a';
  // đuôi phía sau: quất sang hai bên (A.tail), khi quật đuôi thì vung rộng ra
  const tx = w * (0.55 + 0.25 * Math.abs(A.tail)) * (A.tail < 0 ? -1 : 1), ty = -h * (0.24 - 0.12 * Math.abs(A.tail));
  c.beginPath(); c.moveTo(Math.sign(tx) * w * 0.12, -h * 0.52); c.quadraticCurveTo(tx * 0.75, -h * 0.5, tx, ty);
  c.quadraticCurveTo(tx * 0.7, -h * 0.3, Math.sign(tx) * w * 0.1, -h * 0.34); c.closePath(); c.fillStyle = shade(col, -0.3); c.fill();
  for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) { // chân: nhấc lên khi bước, gối co
    part(c, sd * w * 0.2, -h * 0.42, 0, -lift * h * 0.08, 1, -sd * lift * 0.12, () => {
      ell(c, sd * w * 0.2, -h * 0.31, w * 0.14, h * 0.16); c.fillStyle = bodyGrad(c, sd * w * 0.2, -h * 0.31, w * 0.14, col); c.fill();
      c.beginPath(); c.moveTo(sd * w * 0.15, -h * 0.22); c.lineTo(sd * w * 0.27, -h * 0.22); c.lineTo(sd * w * 0.26, -h * 0.03); c.lineTo(sd * w * 0.16, -h * 0.03); c.closePath();
      c.fillStyle = shade(col, -0.2); c.fill();
      ell(c, sd * w * 0.21, -h * 0.025, w * 0.11, h * 0.035); c.fillStyle = shade(col, -0.3); c.fill();
      claws(c, sd * w * 0.21, -h * 0.01, w * 0.07, 3);
    });
  }
  part(c, 0, -h * 0.3, 0, -A.bob * h, 1, 0, () => {
    ell(c, 0, -h * 0.48, w * 0.32, h * 0.25); c.fillStyle = bodyGrad(c, 0, -h * 0.48, w * 0.32, col); c.fill();
    c.strokeStyle = shade(col, -0.35); c.lineWidth = w * 0.018;
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(sd * w * 0.29, -h * (0.4 + i * 0.08)); c.quadraticCurveTo(sd * w * 0.24, -h * (0.43 + i * 0.08), sd * w * 0.2, -h * (0.42 + i * 0.08)); c.stroke(); }
    ell(c, 0, -h * 0.44, w * 0.17, h * 0.19); c.fillStyle = belly; c.fill();
    c.strokeStyle = shade(belly, -0.25); c.lineWidth = w * 0.008;
    for (let i = 1; i < 6; i++) { const y = -h * (0.3 + i * 0.045); const hw = w * 0.16 * Math.sqrt(Math.max(0, 1 - Math.pow((y + h * 0.44) / (h * 0.19), 2))); c.beginPath(); c.moveTo(-hw, y); c.quadraticCurveTo(0, y + h * 0.01, hw, y); c.stroke(); }
    for (const [sd, ar] of [[-1, A.armL], [1, A.armR]]) { // tay ngắn: cào cào khi gồng
      part(c, sd * w * 0.16, -h * 0.6, 0, 0, 1, -sd * ar, () => {
        c.strokeStyle = shade(col, -0.1); c.lineWidth = w * 0.045; c.lineCap = 'round';
        c.beginPath(); c.moveTo(sd * w * 0.16, -h * 0.6); c.lineTo(sd * w * 0.22, -h * 0.55); c.lineTo(sd * w * 0.2, -h * 0.5); c.stroke();
        claws(c, sd * w * 0.2, -h * 0.5, w * 0.04, 2);
      });
    }
    c.beginPath(); c.moveTo(-w * 0.16, -h * 0.62); c.lineTo(-w * 0.13 + A.headX * w * 0.5, -h * 0.75 + A.headY * h * 0.5); c.lineTo(w * 0.13 + A.headX * w * 0.5, -h * 0.75 + A.headY * h * 0.5); c.lineTo(w * 0.16, -h * 0.62); c.closePath();
    c.fillStyle = col; c.fill();
    // ĐẦU: dời / xoay / phóng to quanh gốc cổ
    part(c, 0, -h * 0.74, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
      const hy = -h * 0.84, hw = w * 0.46, hh = h * 0.17;
      c.beginPath(); c.moveTo(-hw / 2, hy + hh * 0.35); c.quadraticCurveTo(-hw * 0.56, hy - hh * 0.6, -hw * 0.2, hy - hh * 0.8);
      c.quadraticCurveTo(0, hy - hh * 0.95, hw * 0.2, hy - hh * 0.8); c.quadraticCurveTo(hw * 0.56, hy - hh * 0.6, hw / 2, hy + hh * 0.35);
      c.quadraticCurveTo(0, hy + hh * 0.55, -hw / 2, hy + hh * 0.35); c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
      c.fillStyle = shade(col, -0.25);
      for (let i = 0; i < 7; i++) { ell(c, (i - 3) * hw * 0.09, hy - hh * (0.55 + 0.1 * Math.cos(i)), hw * 0.025, hh * 0.05); c.fill(); }
      ell(c, -hw * 0.08, hy - hh * 0.05, hw * 0.03, hh * (0.06 + A.glow * 0.02)); c.fillStyle = '#1b1208'; c.fill(); // lỗ mũi phập phồng
      ell(c, hw * 0.08, hy - hh * 0.05, hw * 0.03, hh * (0.06 + A.glow * 0.02)); c.fill();
      eyes(c, hw * 0.33, hy - hh * 0.38, hw * 0.075, A, col, hw * 0.14);
      mouth(c, 0, hy + hh * 0.35, hw * 0.92, A.jaw * h * 0.16, col, 9, hh * 0.28);
    });
  });
}

// ---------------- RAPTOR ----------------
function raptor(c, w, h, A) {
  // bảng màu đổi được → dùng lại cho Compsognathus (mặt nạ, đuôi khoang) và Pachycephalosaurus (đầu vòm)
  const P = A.pal || {}, col = P.col || '#e0782b', dark = P.dark || '#6b2f12';
  const tx = -w * (0.75 + 0.1 * A.tail), ty = -h * (0.62 + 0.12 * A.tail);
  c.beginPath(); c.moveTo(-w * 0.1, -h * 0.5); c.quadraticCurveTo(-w * 0.5, -h * (0.55 + A.tail * 0.06), tx, ty);
  c.quadraticCurveTo(-w * 0.5, -h * 0.48, -w * 0.08, -h * 0.42); c.closePath(); c.fillStyle = shade(col, -0.3); c.fill();
  if (P.stripes) { c.strokeStyle = P.stripes; c.lineWidth = w * 0.035; for (let i = 1; i <= 4; i++) { const k = i / 5; c.beginPath(); c.moveTo(-w * (0.1 + 0.6 * k), -h * (0.5 + 0.1 * k + A.tail * 0.06 * k) - h * 0.04); c.lineTo(-w * (0.1 + 0.6 * k) - w * 0.02, -h * (0.5 + 0.1 * k + A.tail * 0.06 * k) + h * 0.05); c.stroke(); } }
  for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) {
    part(c, sd * w * 0.16, -h * 0.45, 0, -lift * h * 0.1, 1, -sd * lift * 0.2, () => {
      ell(c, sd * w * 0.16, -h * 0.4, w * 0.11, h * 0.12); c.fillStyle = bodyGrad(c, sd * w * 0.16, -h * 0.4, w * 0.11, col); c.fill();
      c.strokeStyle = shade(col, -0.25); c.lineWidth = w * 0.065; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sd * w * 0.18, -h * 0.32); c.lineTo(sd * w * (0.22 + lift * 0.04), -h * (0.16 + lift * 0.05)); c.lineTo(sd * w * 0.2, -h * 0.03); c.stroke();
      claws(c, sd * w * 0.2, -h * 0.015, w * 0.06, 2);
      c.strokeStyle = '#f4ecd8'; c.lineWidth = w * 0.02; c.beginPath(); c.arc(sd * w * 0.25, -h * 0.05, w * (0.05 + lift * 0.02), Math.PI * 1.1, Math.PI * 1.8); c.stroke(); // móng liềm vung lên
    });
  }
  part(c, 0, -h * 0.4, 0, -A.bob * h, 1, 0, () => {
    ell(c, 0, -h * 0.52, w * 0.22, h * 0.17); c.fillStyle = bodyGrad(c, 0, -h * 0.52, w * 0.22, col); c.fill();
    c.strokeStyle = dark; c.lineWidth = w * 0.03;
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sd * w * (0.12 + i * 0.025), -h * (0.62 - i * 0.04)); c.lineTo(sd * w * (0.2 + i * 0.02), -h * (0.56 - i * 0.04)); c.stroke(); }
    ell(c, 0, -h * 0.5, w * 0.1, h * 0.12); c.fillStyle = P.belly || '#f2d3a6'; c.fill();
    for (const [sd, ar] of [[-1, A.armL], [1, A.armR]]) { // tay có lông + móng: giương ra, cào xuống
      part(c, sd * w * 0.14, -h * 0.6, 0, 0, 1, -sd * ar, () => {
        c.strokeStyle = col; c.lineWidth = w * 0.05; c.lineCap = 'round';
        c.beginPath(); c.moveTo(sd * w * 0.14, -h * 0.6); c.lineTo(sd * w * 0.3, -h * 0.55); c.lineTo(sd * w * 0.36, -h * 0.46); c.stroke();
        c.fillStyle = P.wing || '#2a6f97';
        for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sd * w * (0.2 + i * 0.04), -h * (0.58 - i * 0.025)); c.lineTo(sd * w * (0.22 + i * 0.04), -h * (0.5 - i * 0.025)); c.lineTo(sd * w * (0.25 + i * 0.04), -h * (0.57 - i * 0.025)); c.fill(); }
        claws(c, sd * w * 0.36, -h * 0.46, w * 0.06, 3);
      });
    }
    c.strokeStyle = col; c.lineWidth = w * 0.14; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -h * 0.62); c.quadraticCurveTo(A.headX * w * 0.6, -h * 0.72 + A.headY * h * 0.5, A.headX * w, -h * 0.8 + A.headY * h); c.stroke();
    part(c, 0, -h * 0.8, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
      const hy = -h * 0.86, hw = w * 0.3, hh = h * 0.13;
      if (P.dome) { // Pachycephalosaurus: vòm sọ dày, viền núm gai
        const dg = c.createRadialGradient(-hw * 0.1, hy - hh * 1.1, hw * 0.05, 0, hy - hh * 0.7, hw * 0.6); dg.addColorStop(0, '#f0dcb0'); dg.addColorStop(1, shade(P.dome, -0.3));
        ell(c, 0, hy - hh * 0.75, hw * 0.52, hh * 0.95); c.fillStyle = dg; c.fill();
        c.fillStyle = shade(col, -0.35);
        for (let i = 0; i < 9; i++) { const a = Math.PI * (0.95 + i / 8 * 1.1); ell(c, Math.cos(a) * hw * 0.55, hy - hh * 0.45 + Math.sin(a) * hh * 0.5, hw * 0.045, hh * 0.08); c.fill(); }
      } else if (P.crest !== null) {
        c.fillStyle = P.crest || '#2a9df4'; // mào lông dựng lên khi gồng
        for (let i = 0; i < 6; i++) { const x = (i - 2.5) * hw * 0.12; c.beginPath(); c.moveTo(x - hw * 0.05, hy - hh * 0.6); c.lineTo(x + Math.sin(A.t * 3 + i) * hw * 0.02, hy - hh * (1.3 + 0.25 * Math.cos(i * 1.7) + A.glow * 0.4)); c.lineTo(x + hw * 0.05, hy - hh * 0.6); c.fill(); }
      }
      c.beginPath(); c.moveTo(-hw / 2, hy - hh * 0.2); c.quadraticCurveTo(-hw * 0.45, hy - hh * 0.9, 0, hy - hh * 0.85);
      c.quadraticCurveTo(hw * 0.45, hy - hh * 0.9, hw / 2, hy - hh * 0.2); c.lineTo(hw * 0.3, hy + hh * 0.5); c.quadraticCurveTo(0, hy + hh * 0.75, -hw * 0.3, hy + hh * 0.5); c.closePath();
      c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
      if (P.mask) { c.fillStyle = P.mask; ell(c, -hw * 0.3, hy - hh * 0.3, hw * 0.17, hh * 0.22, 0.3); c.fill(); ell(c, hw * 0.3, hy - hh * 0.3, hw * 0.17, hh * 0.22, -0.3); c.fill(); }
      c.strokeStyle = dark; c.lineWidth = w * 0.015; c.beginPath(); c.moveTo(0, hy - hh * 0.8); c.lineTo(0, hy + hh * 0.1); c.stroke();
      eyes(c, hw * 0.3, hy - hh * 0.3, hw * (P.eyeR || 0.09), A, col, P.dome ? 0 : hw * 0.15);
      ell(c, -hw * 0.07, hy + hh * 0.25, hw * 0.025, hh * 0.05); c.fillStyle = '#1b1208'; c.fill(); ell(c, hw * 0.07, hy + hh * 0.25, hw * 0.025, hh * 0.05); c.fill();
      mouth(c, 0, hy + hh * 0.5, hw * 0.62, A.jaw * h * 0.12, col, 7, hh * 0.3);
    });
  });
}

// ---------------- TRICERATOPS ----------------
function trike(c, w, h, A) {
  const col = '#5f86a8', frill = '#d9662b';
  part(c, 0, -h * 0.3, 0, -A.bob * h, 1, 0, () => { ell(c, 0, -h * 0.5, w * 0.44, h * 0.3); c.fillStyle = bodyGrad(c, 0, -h * 0.5, w * 0.44, col); c.fill(); });
  for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) { // chân trước như cột: cào đất trước khi húc
    part(c, sd * w * 0.28, -h * 0.35, 0, -lift * h * 0.1, 1, sd * lift * 0.08, () => {
      c.beginPath(); c.moveTo(sd * w * 0.2, -h * 0.35); c.lineTo(sd * w * 0.36, -h * 0.35); c.lineTo(sd * w * 0.35, -h * 0.03); c.lineTo(sd * w * 0.21, -h * 0.03); c.closePath();
      c.fillStyle = bodyGrad(c, sd * w * 0.28, -h * 0.2, w * 0.12, col); c.fill();
      ell(c, sd * w * 0.28, -h * 0.03, w * 0.1, h * 0.04); c.fillStyle = shade(col, -0.35); c.fill();
      claws(c, sd * w * 0.28, -h * 0.02, w * 0.05, 3, '#e8e0cc');
    });
  }
  // ĐẦU + diềm: cúi xuống (headY > 0) chĩa sừng về phía người xem khi húc, hất lên khi hất sừng
  part(c, 0, -h * 0.4, A.headX * w, A.headY * h - A.bob * h, A.headS, A.headRot, () => {
    const fy = -h * 0.66, fr = w * 0.4, frh = h * 0.36;
    c.fillStyle = shade(frill, -0.3);
    for (let i = 0; i <= 12; i++) { const a = Math.PI * (1.02 + i / 12 * 0.96); const x = Math.cos(a) * fr * 1.07, y = fy + Math.sin(a) * frh * 1.07; c.beginPath(); c.moveTo(x - fr * 0.05, y + frh * 0.03); c.lineTo(Math.cos(a) * fr * 1.2, fy + Math.sin(a) * frh * 1.2); c.lineTo(x + fr * 0.05, y + frh * 0.03); c.fill(); }
    ell(c, 0, fy, fr, frh); const g = c.createRadialGradient(0, fy, fr * 0.2, 0, fy, fr); g.addColorStop(0, '#f2c14e'); g.addColorStop(0.55, frill); g.addColorStop(1, shade(frill, -0.4)); c.fillStyle = g; c.fill();
    for (const sd of [-1, 1]) { ell(c, sd * fr * 0.55, fy - frh * 0.35, fr * 0.12, frh * 0.12); c.fillStyle = '#3b1a5a'; c.fill(); ell(c, sd * fr * 0.55, fy - frh * 0.35, fr * 0.06, frh * 0.06); c.fillStyle = '#ffe27a'; c.fill(); }
    const top = -h * 0.66, bot = -h * 0.16, fw = w * 0.34;
    c.beginPath(); c.moveTo(-fw / 2, top); c.quadraticCurveTo(0, top - h * 0.06, fw / 2, top);
    c.quadraticCurveTo(fw * 0.42, -h * 0.35, fw * 0.12, bot); c.quadraticCurveTo(0, bot + h * 0.04, -fw * 0.12, bot);
    c.quadraticCurveTo(-fw * 0.42, -h * 0.35, -fw / 2, top); c.closePath(); c.fillStyle = bodyGrad(c, 0, -h * 0.45, fw * 0.6, col); c.fill();
    c.beginPath(); c.moveTo(-fw * 0.16, -h * 0.25); c.quadraticCurveTo(0, -h * 0.2 + A.jaw * h * 0.05, fw * 0.16, -h * 0.25); c.lineTo(0, -h * 0.1); c.closePath(); c.fillStyle = '#3d3a36'; c.fill();
    if (A.jaw > 0.1) { ell(c, 0, -h * 0.2, fw * 0.08, A.jaw * h * 0.04); c.fillStyle = '#4a0d0d'; c.fill(); }
    c.beginPath(); c.moveTo(-fw * 0.07, -h * 0.33); c.lineTo(0, -h * 0.43); c.lineTo(fw * 0.07, -h * 0.33); c.closePath(); c.fillStyle = '#efe6cf'; c.fill();
    eyes(c, fw * 0.24, -h * 0.5, fw * 0.08, A, col, 0);
    for (const sd of [-1, 1]) {
      const hg = c.createLinearGradient(sd * fw * 0.2, -h * 0.56, sd * w * 0.27, -h * 0.98); hg.addColorStop(0, '#cdbf9c'); hg.addColorStop(1, '#fffaf0');
      c.beginPath(); c.moveTo(sd * fw * 0.1, -h * 0.58); c.quadraticCurveTo(sd * w * 0.12, -h * 0.85, sd * w * 0.27, -h * 0.98);
      c.quadraticCurveTo(sd * w * 0.18, -h * 0.75, sd * fw * 0.34, -h * 0.57); c.closePath(); c.fillStyle = hg; c.fill();
    }
  });
}

// ---------------- PTERODACTYL ----------------
function ptero(c, w, h, A) {
  const col = '#8a5bc4', mem = '#5e3c8f', flap = A.wing, span = 1 - 0.65 * A.wingFold;
  part(c, 0, -h * 0.55, 0, -A.bob * h, 1, 0, () => {
    for (const sd of [-1, 1]) { // cánh màng: vỗ (flap) và cụp lại khi bổ nhào (wingFold)
      const tipY = -h * (0.72 + flap * 0.16 - A.wingFold * 0.1), wristY = -h * (0.7 + flap * 0.08 - A.wingFold * 0.05);
      const wx = sd * w * 0.27 * span, tx = sd * w * 0.5 * span;
      c.beginPath(); c.moveTo(sd * w * 0.05, -h * 0.64); c.lineTo(wx, wristY); c.lineTo(tx, tipY);
      c.quadraticCurveTo(sd * w * 0.33 * span, -h * (0.5 + A.wingFold * 0.05), sd * w * 0.06, -h * 0.4); c.closePath();
      const g = c.createLinearGradient(0, -h * 0.7, tx, -h * 0.5); g.addColorStop(0, mem); g.addColorStop(1, shade(mem, 0.25)); c.fillStyle = g; c.fill();
      c.strokeStyle = shade(col, -0.3); c.lineWidth = w * 0.014; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sd * w * 0.05, -h * 0.64); c.lineTo(wx, wristY); c.lineTo(tx, tipY); c.stroke();
      c.lineWidth = w * 0.006; c.globalAlpha = 0.5;
      for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(wx, wristY); c.lineTo(sd * w * (0.27 + 0.06 * i) * span, -h * (0.52 + 0.02 * i)); c.stroke(); }
      c.globalAlpha = 1; claws(c, wx, wristY, w * 0.025, 3);
    }
    ell(c, 0, -h * 0.55, w * 0.075, h * 0.15); c.fillStyle = bodyGrad(c, 0, -h * 0.55, w * 0.08, col); c.fill();
    for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) { // chân quặp: duỗi móng ra khi vồ
      c.strokeStyle = col; c.lineWidth = w * 0.02; c.beginPath(); c.moveTo(sd * w * 0.03, -h * 0.42); c.lineTo(sd * w * (0.05 + lift * 0.04), -h * (0.33 - lift * 0.03)); c.stroke();
      claws(c, sd * w * (0.05 + lift * 0.04), -h * (0.33 - lift * 0.03), w * (0.02 + lift * 0.015), 3);
    }
    part(c, 0, -h * 0.7, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
      const hy = -h * 0.76;
      c.beginPath(); c.moveTo(-w * 0.02, hy - h * 0.06); c.quadraticCurveTo(w * 0.01, hy - h * 0.25, w * 0.05, hy - h * 0.3); c.quadraticCurveTo(w * 0.04, hy - h * 0.15, w * 0.03, hy - h * 0.05); c.closePath();
      c.fillStyle = '#e8543b'; c.fill();
      ell(c, 0, hy, w * 0.065, h * 0.075); c.fillStyle = bodyGrad(c, 0, hy, w * 0.065, col); c.fill();
      // mỏ: 2 nửa tách ra khi há (jaw)
      const bg = c.createLinearGradient(0, hy, 0, hy + h * 0.2); bg.addColorStop(0, '#f2d27a'); bg.addColorStop(1, '#a8781e');
      for (const sd of [-1, 1]) {
        const o = sd * A.jaw * w * 0.018;
        c.beginPath(); c.moveTo(o, hy + h * 0.02); c.lineTo(sd * w * 0.035 + o, hy + h * 0.02); c.lineTo(o * 2, hy + h * 0.2); c.closePath(); c.fillStyle = bg; c.fill();
      }
      if (A.jaw > 0.1) { c.fillStyle = '#4a0d0d'; c.beginPath(); c.moveTo(-A.jaw * w * 0.016, hy + h * 0.03); c.lineTo(A.jaw * w * 0.016, hy + h * 0.03); c.lineTo(0, hy + h * 0.18); c.closePath(); c.fill(); }
      eyes(c, w * 0.035, hy - h * 0.015, w * 0.016, A, col, 0);
    });
  });
}

const DRAW = {
  trex, raptor, trike, ptero, ...SPECIES_DRAW,
  compy: (c, w, h, A) => raptor(c, w, h, { ...A, pal: PAL.compy }),
  pachy: (c, w, h, A) => raptor(c, w, h, { ...A, pal: PAL.pachy }),
};
const WATER = new Set(['deino', 'mosa']);

/** Vẽ 1 khủng long vào ctx tại khung B (gốc = giữa chân). A: tư thế (xem P0). */
export function drawDino(ctx, key, B, A) {
  A = { ...P0, ...A };
  ctx.save();
  ctx.translate(B.x, B.y);
  if (A.crouch) ctx.scale(1 + A.crouch * 0.04, 1 - A.crouch * 0.08);
  if (!WATER.has(key)) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ell(ctx, 0, key === 'ptero' ? B.h * 0.25 : 0, B.w * 0.36, B.h * 0.045); ctx.fill(); }
  (DRAW[key] || trex)(ctx, B.w, B.h, A);
  ctx.restore();
}

// ---------------- Biên đạo động tác (theo MẪU đòn, dùng chung mọi loài) ----------------
const clamp01 = x => Math.max(0, Math.min(1, x));
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = x => { x = clamp01(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
/** 0 → 1 → 0: lên trong [a,b], giữ tới c, về 0 tại d. */
const env = (x, a, b, c, d) => (x <= a || x >= d ? 0 : x < b ? easeOut((x - a) / (b - a)) : x <= c ? 1 : 1 - easeInOut((x - c) / (d - c)));
export const STRIKE_LEAD = 0.22; // động tác ra đòn bắt đầu trước lúc chạm 0,22 s → hình "chạm" đúng lúc chốt né/đỡ

/**
 * Tư thế từng bộ phận + biến đổi toàn thân. Gồng (k 0→1) rồi ra đòn (s: kể từ lúc bắt đầu vung, chạm tại STRIKE_LEAD).
 * @returns { A, sx, ox, oy, rot, focusV, shake, stomp, tmpl, k, s }
 */
export function dinoPose(d, clock, t, W, H) {
  const key = d.key, A = { ...P0, t };
  let sx = 1, ox = 0, oy = 0, rot = 0, focusV = 0.6, shake = 0, stomp = false;
  const big = key === 'trex' || key === 'trike' || key === 'ankylo' || key === 'stego' || key === 'spino' || key === 'allo';
  A.bob = Math.sin(t * 2.2) * 0.008; A.look = Math.sin(t * 0.7) * 0.4; A.tail = Math.sin(t * 1.4) * 0.35;
  A.headRot = Math.sin(t * 0.9) * 0.04; A.jaw = 0.12 + 0.08 * Math.max(0, Math.sin(t * 0.8)) ** 8 * 6;
  A.wing = Math.sin(t * 6); A.armL = A.armR = Math.sin(t * 1.7) * 0.08; A.broken = Object.fromEntries(Object.entries(d.parts || {}).map(([k, p]) => [k, p.broken]));
  if (d.rage) A.glow = Math.max(A.glow, 0.25 * d.rage); // giận: mắt đỏ dần
  const walk = (speed, liftAmt = 1) => {
    const ph = t * speed, s = Math.sin(ph);
    A.legL = Math.max(0, s) * liftAmt; A.legR = Math.max(0, -s) * liftAmt;
    A.bob = Math.abs(s) * 0.025; A.headY = Math.abs(s) * 0.012; A.headRot = s * 0.05; A.tail = -s * 0.5;
    stomp = Math.abs(s) < 0.12;
  };
  if (d.phase === 'enter') {
    if (WATER.has(key)) { oy = H * 0.12 * (1 - d.t / 2.2); A.jaw = 0; } // trồi dần lên
    else if (key === 'ptero') { A.wing = Math.sin(t * 9); A.bob = Math.sin(t * 9) * 0.02; }
    else walk(key === 'raptor' || key === 'compy' ? 10 : key === 'pachy' ? 8 : big ? 5 : 6.5);
  } else if (d.phase === 'counter' || d.phase === 'tired') { // choáng / thở dốc: đầu gục, lảo đảo, hàm trễ, mắt nheo
    const pant = Math.sin(t * (d.phase === 'tired' ? 9 : 5));
    A.headY = 0.06; A.headRot = Math.sin(t * 7) * 0.18; A.headX = Math.sin(t * 5) * 0.03; A.jaw = 0.5 + 0.2 * pant; A.squint = 0.8; A.wing = Math.sin(t * 3) * 0.4;
    rot = Math.sin(t * 5) * 0.04; A.tail = 0; A.armL = A.armR = -0.3; A.bob = d.phase === 'tired' ? 0.02 * pant : 0; A.glow = 0;
    if (WATER.has(key)) { oy = H * 0.04; A.jaw = 0.4; }
  } else if (d.phase === 'rest') { // thị uy: phô mào / buồm / phiến, gầm trầm
    const k = env(d.t, 0, 0.6, 2.8, 3.6);
    A.headY = -0.06 * k; A.jaw = 0.2 + 0.5 * k * (0.5 + 0.5 * Math.sin(t * 3)); A.sailOpen = k; A.glow = 0.4 * k; A.armL = A.armR = 0.4 * k; A.wingOpen = 0.6 * k; rot = 0.06 * k * Math.sin(t * 1.2);
  } else if (d.phase === 'down') {
    const k = easeInOut(d.t / 1.2);
    A.crouch = k; A.headY = 0.1 * k; A.headRot = 0.5 * k; A.jaw = 0.7; A.squint = 1; A.wingFold = k; A.wing = -k;
    rot = 0.85 * k * (key === 'ptero' ? -1 : 1); oy = H * 0.06 * k + (WATER.has(key) ? H * 0.2 * k : 0);
  }

  // ---- đòn: nhát đang gồng / đang vung, hoặc thu về sau nhát vừa chạm ----
  let k = -1, s = -1, hit = null;
  if (d.phase === 'attack' && d.cur) {
    const to = d.curTo, tele = Math.max(0.3, d.cur.tele || 1);
    if (to > STRIKE_LEAD) { hit = d.cur; k = clamp01(1 - (to - STRIKE_LEAD) / Math.max(0.2, tele - STRIKE_LEAD)); }
    else if (to > -0.5) { hit = d.cur; k = 1; s = STRIKE_LEAD - to; }
    if (d.lastStrike && clock - d.lastStrike.at < 0.6 && k < 0.5 && d.lastStrike !== d.cur) { hit = d.lastStrike.hit; k = 1; s = STRIKE_LEAD + (clock - d.lastStrike.at); }
  } else if (d.lastStrike && clock - d.lastStrike.at < 0.9 && ['counter', 'recover', 'tired', 'idle'].includes(d.phase)) { hit = d.lastStrike.hit; k = 1; s = STRIKE_LEAD + (clock - d.lastStrike.at); }
  if (hit) {
    const tmpl = hit.tmpl, dir = hit.dir || 0, w = easeInOut(k);
    const tr = Math.sin(t * 40) * 0.5 + 0.5;
    const L = s >= 0 ? env(s, 0, STRIKE_LEAD, STRIKE_LEAD + 0.12, 0.95) : 0;
    const fake = hit.fake;
    const Lf = fake ? Math.min(L, 0.25) : L; // giả đòn: vung nửa chừng rồi giật lại
    if (d.phase === 'attack') A.glow = Math.max(A.glow, 0.6 + 0.4 * w);
    switch (tmpl) {
      case 'bite': { // ngả đầu ra sau & sang phía ngược, run → phóng đầu tới phía người chơi đứng, ĐỚP khép hàm
        A.headY = -0.12 * w * (1 - Lf) + 0.2 * Lf; A.headX = dir * 0.06 * w * (1 - Lf) - dir * 0.32 * Lf; A.headRot = (dir * 0.3 * w + Math.sin(t * 25) * 0.04 * w) * (1 - Lf);
        A.headS = 1 - 0.12 * w + 1.6 * Lf; A.jaw = s < 0 ? 0.25 + 0.6 * w + tr * 0.05 : s < STRIKE_LEAD - 0.03 ? 1 : 1 - easeOut((s - STRIKE_LEAD + 0.03) / 0.08) * 0.95;
        A.armL = A.armR = 0.5 * w; A.tail = dir * 0.8 * w; A.crouch = 0.4 * w * (1 - Lf);
        sx = 1 - 0.06 * w * (1 - Lf) + 0.12 * Lf; ox = dir * W * 0.04 * w * (1 - Lf) - dir * W * 0.05 * Lf; focusV = 0.85;
        break;
      }
      case 'chop': { // BỔ RÌU: ngẩng cao, há cực rộng → bổ thẳng xuống một bên
        A.headY = -0.18 * w * (1 - Lf) + 0.25 * Lf; A.headX = -dir * 0.28 * Lf + dir * 0.04 * w * (1 - Lf); A.headS = 1 + 1.2 * Lf; A.jaw = s < 0 ? 0.3 + 0.7 * w : 1 - 0.8 * clamp01((s - STRIKE_LEAD) / 0.1);
        A.headRot = -dir * 0.25 * Lf; A.armL = A.armR = 0.7 * w; A.tail = -0.7 * w; oy = -H * 0.03 * w * (1 - Lf); focusV = 0.85;
        if (key === 'stego') { A.tail = -dir * (0.4 + 0.6 * w) + dir * 1.6 * Lf; rot = dir * 0.15 * w - dir * 0.3 * Lf; A.headX = 0; A.headS = 1; A.headY = 0; } // đâm gai: xoay hông
        break;
      }
      case 'peck': { // MỔ: co cổ chữ S, đứng im → thọc mỏ cực nhanh
        A.headY = -0.08 * w * (1 - Lf) + 0.18 * Lf; A.headS = 1 - 0.15 * w + 1.5 * Lf; A.headX = -dir * 0.3 * Lf; A.look = -dir;
        A.jaw = s >= 0 && s < STRIKE_LEAD ? 0.6 : 0.1; A.bob = 0; focusV = 0.88; A.wing = key === 'ptero' ? Math.sin(t * 12) : A.wing;
        break;
      }
      case 'charge': case 'ram': { // HÚC / LAO: cúi đầu chĩa sừng/vòm, cào đất, khịt → lao cả thân sang bên
        A.headY = 0.1 * w; A.headS = 1 + 0.12 * w + 0.3 * Lf; A.jaw = 0.3 * w; A.headRot = Math.sin(t * 9) * 0.06 * w * (1 - Lf);
        const paw = s < 0 ? Math.max(0, Math.sin(t * 11)) * Math.min(1, w * 1.6) : 0;
        A.legL = -dir < 0 ? paw : 0; A.legR = -dir > 0 ? paw : 0; stomp = s < 0 && paw < 0.1 && w > 0.3;
        if (s >= 0) { const g = Math.sin(t * 20); A.legL = Math.max(0, g); A.legR = Math.max(0, -g); A.bob = Math.abs(g) * 0.03; }
        const sz = tmpl === 'ram' ? 0.9 : 0.65;
        sx = 1 + sz * Lf; ox = dir * W * 0.04 * w * (1 - Lf) - dir * W * 0.3 * Lf; oy = H * 0.05 * Lf; focusV = tmpl === 'ram' ? 0.75 : 0.5; A.crouch = 0.6 * w * (1 - Lf);
        if (hit.flank) { ox = dir * W * 0.12 * w * (1 - Lf) - dir * W * 0.25 * Lf; rot = dir * 0.1 * w; } // húc sườn: chạy chéo
        break;
      }
      case 'leap': { // PHÓNG KHỎI NƯỚC: chìm xuống (chỉ thấy mắt), gợn sóng → trồi vọt lên sang 1 bên
        oy = H * 0.1 * w * (1 - Lf) - H * 0.2 * Lf; sx = 1 + 0.8 * Lf; ox = -dir * W * 0.25 * Lf; A.jaw = s < 0 ? 0.1 : 1 - 0.7 * clamp01((s - STRIKE_LEAD) / 0.15);
        A.headS = 1 + 0.3 * Lf; A.armL = A.armR = 0.8 * Lf; focusV = 0.7;
        break;
      }
      case 'sweepLow': case 'stomp': case 'snapLow': { // đòn THẤP → NHẢY
        if (tmpl === 'stomp') { A.legL = w; oy = -H * 0.05 * w * (1 - Lf); A.headY = -0.08 * w; A.jaw = 0.6 * w; A.crouch = 0; if (s > STRIKE_LEAD - 0.02 && s < STRIKE_LEAD + 0.1) shake = 16; A.legL = s >= 0 ? 0 : w; A.armL = A.armR = 0.6 * w; }
        else if (tmpl === 'snapLow') { A.headY = -0.04 * w * (1 - Lf) + 0.38 * Lf; A.headS = 1 + 0.8 * Lf; A.jaw = s < 0 ? 0.3 + 0.5 * w : 1 - 0.9 * clamp01((s - STRIKE_LEAD) / 0.08); A.crouch = 0.5 * w; focusV = 0.85; sx = 1 + 0.15 * Lf; }
        else { A.tail = -1 * w + 2 * Lf; rot = 0.14 * w - 0.3 * Lf; A.crouch = 0.5 * w; A.headX = 0.05 * w * (1 - Lf); A.jaw = 0.3 * w; } // quét đuôi / chùy thấp
        break;
      }
      case 'sweepHigh': case 'swipe': case 'pounce': case 'dive': { // đòn NGANG ĐẦU / VỒ → NGỒI
        if (tmpl === 'pounce') { A.crouch = w * (1 - Lf); A.armL = A.armR = 0.9 * w + 0.4 * Lf; ox = Math.sin(t * 16) * W * 0.012 * w * (1 - Lf); A.jaw = 0.4 * w + 0.6 * Lf; A.tail = -0.9 * w; A.legL = A.legR = Lf; A.headS = 1 + 0.3 * Lf; sx = 1 - 0.05 * w * (1 - Lf) + 1.0 * Lf; oy = H * 0.03 * w * (1 - Lf) + H * 0.1 * Lf; focusV = 0.86; }
        else if (tmpl === 'dive') { A.wing = s < 0 ? Math.sin(t * 14) * 0.6 + 0.4 * w : -0.6; A.wingFold = Lf; A.jaw = 0.3 * w + 0.7 * Lf; A.legL = A.legR = Lf; A.headS = 1 + 0.4 * Lf; sx = 1 + 1.3 * Lf; oy = -H * 0.14 * w * (1 - Lf) + H * 0.05 * Lf; focusV = 0.65; A.wingOpen = w * (1 - Lf); }
        else if (tmpl === 'swipe') { A.armL = 1.2 * w - 2.4 * Lf; A.armR = 1.2 * w - 2.4 * Lf; A.headY = -0.05 * w; A.jaw = 0.5 * w; sx = 1 + 0.25 * Lf; focusV = 0.6; }
        else if (key === 'trex' || key === 'allo' || key === 'carno') { A.headRot = 0.4 * w - 0.8 * Lf; A.headX = 0.12 * w - 0.3 * Lf; A.headY = 0.1 * Lf; A.headS = 1 + 0.9 * Lf; A.jaw = 0.5 + 0.5 * w; focusV = 0.85; sx = 1 + 0.1 * Lf; } // cắn ngang mặt (sẹo mặt)
        else { A.tail = -1 * w + 2 * Lf; rot = 0.2 * w - 0.4 * Lf; A.headX = 0.06 * w * (1 - Lf) - 0.08 * Lf; A.headRot = 0.2 * w - 0.4 * Lf; A.jaw = 0.3 * w; } // quất đuôi gai / quét diềm
        break;
      }
      case 'roar': case 'gust': case 'wave': case 'butt': { // đẩy / gầm / luồng → GIƠ 2 TAY ĐỠ
        if (tmpl === 'roar') { A.headY = -0.15 * w * (1 - Lf) + 0.08 * Lf; A.headRot = Math.sin(t * 30) * 0.03 * Lf; A.headS = 1 - 0.12 * w + 0.6 * Lf; A.jaw = s < 0 ? 0.2 + 0.4 * w : 1; A.armL = A.armR = 0.9 * w; A.tail = 0.6 * Math.sin(t * 8) * w; A.sailOpen = w; sx = 1 + 0.06 * w + 0.08 * Lf; oy = -H * 0.03 * w * (1 - Lf); focusV = 0.85; shake = s >= STRIKE_LEAD ? 14 * (1 - clamp01((s - STRIKE_LEAD) / 0.6)) : 2 * w; }
        else if (tmpl === 'gust') { A.wingOpen = w; A.wing = Math.sin(t * 10) * w; A.legL = A.legR = 0.5 * Lf; oy = -H * 0.08 * Lf; A.headY = -0.06 * w; shake = s >= STRIKE_LEAD ? 8 : 0; }
        else if (tmpl === 'wave') { A.tail = -0.6 * w + 1.6 * Lf; A.armL = A.armR = 0.4 * w; oy = H * 0.04 * w * (1 - Lf); rot = 0.08 * w - 0.12 * Lf; }
        else { A.headY = 0.08 * w * (1 - Lf); A.headS = 1 + 0.6 * Lf; sx = 1 + 0.25 * Lf; A.crouch = 0.4 * w * (1 - Lf); focusV = 0.84; } // húc sừng thẳng vào giữa
        break;
      }
      case 'lock': { // KHOÁ SỪNG: tiến chậm, sừng ngang ngực → giằng co (rung, đẩy)
        A.headY = 0.08 * w; A.headS = 1 + 0.15 * w; sx = 1 + 0.25 * w + 0.3 * L;
        if (s >= STRIKE_LEAD) { const push = Math.sin(t * 14); ox = push * W * 0.01; A.headRot = push * 0.05; shake = 5; A.legL = Math.max(0, Math.sin(t * 8)); A.legR = Math.max(0, -Math.sin(t * 8)); sx = 1.55; }
        focusV = 0.6;
        break;
      }
      case 'throw': { A.headY = 0.05 * Lf; A.headS = 1 + 0.25 * Lf; A.jaw = 0.4 + 0.5 * Lf; A.wing = Math.sin(t * 16); A.armL = A.armR = key === 'ankylo' || key === 'pachy' ? 0 : 0.3 * w; A.legL = (key === 'ankylo' || key === 'pachy') ? Math.max(0, Math.sin(t * 12)) * w : 0; break; }
      case 'mob': { A.jaw = 0.6 * w; A.headY = -0.05 * w; A.crouch = 0.2 * w; A.armL = A.armR = 0.5 * w; break; } // gọi bầy
      case 'myth': { A.myth = env(s >= 0 ? s : -1, 0, 0.25, 0.9, 1.3) || (k > 0.5 ? (k - 0.5) * 2 : 0); A.jaw = 0.7 * w; break; }
      case 'display': { A.sailOpen = w; A.glow = Math.max(A.glow, w); A.headY = -0.05 * w; A.jaw = 0.3 * w; rot = 0.08 * w; break; }
    }
    if (fake && s > STRIKE_LEAD * 0.5) { A.headY -= 0.05; A.jaw = 0.2; } // "nhả đòn": giật lại
    return { A, sx, ox, oy, rot, focusV, shake, stomp, tmpl, k, s, hit };
  }
  if (d.recoil) { A.headRot += 0.25 * d.recoil * (d.recoil > 0.5 ? 1 : -1); A.headY -= 0.03 * d.recoil; A.jaw = Math.max(A.jaw, 0.7 * d.recoil); A.squint = Math.max(A.squint, d.recoil); sx *= 1 - 0.04 * d.recoil; }
  return { A, sx, ox, oy, rot, focusV, shake, stomp, tmpl: null, k: -1, s: -1, hit: null };
}

/** Nền theo màn: plains (Hell Creek hoàng hôn, núi lửa chỉ để trang trí), forest (rừng Jura), river (đầm sông), sea (bờ biển nội địa), night (đêm). */
function paintBg(c, W, H, env) {
  const hz = H * 0.42;
  const SKY = {
    plains: ['#2b1450', '#c2456a', '#ff8a4c', '#ffc46b'], forest: ['#1d4a5a', '#4f8f8a', '#b8d8a8', '#e8eec0'],
    river: ['#2a3b4a', '#5f7f80', '#a9b9a0', '#d8d8b8'], sea: ['#1f5f9f', '#4a9fd8', '#a8dcf0', '#e8f6ff'], night: ['#050818', '#0f1a3a', '#1f2f5a', '#3a4a70'],
  }[env] || ['#2b1450', '#c2456a', '#ff8a4c', '#ffc46b'];
  const sky = c.createLinearGradient(0, 0, 0, hz); SKY.forEach((col, i) => sky.addColorStop([0, 0.45, 0.8, 1][i], col));
  c.fillStyle = sky; c.fillRect(0, 0, W, hz + 2);
  const sunX = env === 'sea' ? W * 0.7 : W * 0.3;
  if (env === 'night') { // trăng + sao
    c.fillStyle = '#fff'; for (let i = 0; i < 90; i++) { c.globalAlpha = 0.3 + 0.7 * ((i * 37) % 10) / 10; ell(c, ((i * 97) % 1000) / 1000 * W, ((i * 53) % 1000) / 1000 * hz * 0.95, 1 + (i % 3) * 0.6, 1 + (i % 3) * 0.6); c.fill(); }
    c.globalAlpha = 1; const mg = c.createRadialGradient(W * 0.75, H * 0.14, 0, W * 0.75, H * 0.14, H * 0.12); mg.addColorStop(0, '#fffbe8'); mg.addColorStop(0.4, '#e8e2c8'); mg.addColorStop(1, 'rgba(232,226,200,0)');
    c.fillStyle = mg; c.fillRect(0, 0, W, hz);
  } else {
    const sun = c.createRadialGradient(sunX, hz * 0.85, 0, sunX, hz * 0.85, H * 0.32); sun.addColorStop(0, 'rgba(255,245,200,0.9)'); sun.addColorStop(0.25, 'rgba(255,220,150,0.45)'); sun.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = sun; c.fillRect(0, 0, W, hz);
  }
  // dãy núi / vách xa
  c.fillStyle = { plains: '#7a3a6b', forest: '#3f6a6a', river: '#5a6a68', sea: '#7a8fa8', night: '#1a2440' }[env] || '#7a3a6b';
  c.beginPath(); c.moveTo(0, hz); for (let x = 0; x <= W; x += W / 12) c.lineTo(x, hz - H * (0.06 + 0.05 * Math.abs(Math.sin(x * 0.013)))); c.lineTo(W, hz); c.fill();
  if (env === 'plains' || env === 'night') { // núi lửa (trang trí — không có cơ sở hoá thạch)
    c.fillStyle = env === 'night' ? '#140c20' : '#4a2246'; c.beginPath(); c.moveTo(W * 0.55, hz); c.lineTo(W * 0.7, hz - H * 0.24); c.lineTo(W * 0.76, hz - H * 0.24); c.lineTo(W * 0.95, hz); c.fill();
    const lava = c.createLinearGradient(0, hz - H * 0.24, 0, hz - H * 0.12); lava.addColorStop(0, '#ffdd55'); lava.addColorStop(1, 'rgba(255,80,0,0)');
    c.fillStyle = lava; c.beginPath(); c.moveTo(W * 0.7, hz - H * 0.24); c.lineTo(W * 0.76, hz - H * 0.24); c.lineTo(W * 0.745, hz - H * 0.12); c.lineTo(W * 0.715, hz - H * 0.15); c.fill();
  }
  if (env === 'sea') { // vách đá phấn trắng ven biển
    c.fillStyle = '#e8e0cc'; c.beginPath(); c.moveTo(0, hz); c.lineTo(0, hz - H * 0.2); c.lineTo(W * 0.12, hz - H * 0.18); c.lineTo(W * 0.2, hz - H * 0.08); c.lineTo(W * 0.24, hz); c.fill();
    c.fillStyle = 'rgba(160,150,130,0.6)'; for (let i = 0; i < 5; i++) c.fillRect(0, hz - H * (0.17 - i * 0.03), W * (0.13 + i * 0.02), H * 0.006);
  }
  // rừng chân trời: forest/river dày cây kim + dương xỉ; plains thưa; sea không cây
  const tree = { plains: '#20301f', forest: '#183a28', river: '#2a3a2a', night: '#0a1210' }[env];
  if (tree) {
    c.fillStyle = tree;
    for (let i = 0; i < 26; i++) { const x = (i / 25) * W, hh = H * (0.03 + 0.03 * ((i * 37) % 5) / 5); ell(c, x, hz, W * 0.035, hh); c.fill(); }
    const conifers = env === 'forest' || env === 'river' ? 14 : 0; // cây kim (araucaria) rừng Jura
    for (let i = 0; i < conifers; i++) { const x = ((i * 61) % 100) / 100 * W, ht = H * (0.12 + 0.12 * ((i * 17) % 7) / 7); c.beginPath(); c.moveTo(x, hz + 2); c.lineTo(x - W * 0.02, hz + 2); c.lineTo(x, hz - ht); c.lineTo(x + W * 0.02, hz + 2); c.fill(); for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x - W * 0.03 * (1 - k * 0.2), hz - ht * k * 0.25); c.lineTo(x, hz - ht * (k * 0.25 + 0.18)); c.lineTo(x + W * 0.03 * (1 - k * 0.2), hz - ht * k * 0.25); c.fill(); } }
    for (const [px, ph] of env === 'plains' || env === 'night' ? [[0.08, 0.2], [0.18, 0.15], [0.86, 0.22], [0.94, 0.16]] : [[0.05, 0.16], [0.95, 0.18]]) {
      const x = W * px, top = hz - H * ph; c.strokeStyle = tree; c.lineWidth = W * 0.006; c.beginPath(); c.moveTo(x, hz); c.quadraticCurveTo(x + W * 0.01, (hz + top) / 2, x, top); c.stroke();
      for (let k = 0; k < 6; k++) { const a = Math.PI * (1 + k / 5); c.beginPath(); c.moveTo(x, top); c.quadraticCurveTo(x + Math.cos(a) * W * 0.04, top + Math.sin(a) * H * 0.03 - H * 0.02, x + Math.cos(a) * W * 0.06, top + H * 0.03); c.lineWidth = W * 0.004; c.stroke(); }
    }
  }
  // mặt đất / mặt nước xa
  const G = { plains: ['#5a4a2a', '#7b5b33', '#3e2c18'], forest: ['#3f5a2a', '#55703a', '#2a3a1c'], river: ['#4a5a3a', '#5f6f48', '#30402a'], sea: ['#d8c89a', '#c8b480', '#9a8458'], night: ['#1e2430', '#262c38', '#10141c'] }[env] || ['#5a4a2a', '#7b5b33', '#3e2c18'];
  const gr = c.createLinearGradient(0, hz, 0, H); gr.addColorStop(0, G[0]); gr.addColorStop(0.5, G[1]); gr.addColorStop(1, G[2]);
  c.fillStyle = gr; c.fillRect(0, hz, W, H - hz);
  if (env === 'sea') { const sg = c.createLinearGradient(0, hz, 0, H * 0.62); sg.addColorStop(0, '#2f7fb8'); sg.addColorStop(1, '#5fb0d8'); c.fillStyle = sg; c.fillRect(0, hz, W, H * 0.2); }
  if (env === 'river') { const sg = c.createLinearGradient(0, hz + H * 0.04, 0, H * 0.7); sg.addColorStop(0, 'rgba(120,150,140,0.9)'); sg.addColorStop(1, 'rgba(70,100,90,0.9)'); c.fillStyle = sg; c.beginPath(); c.moveTo(W * 0.35, hz + 2); c.lineTo(W * 0.65, hz + 2); c.lineTo(W * 1.1, H * 0.75); c.lineTo(-W * 0.1, H * 0.75); c.fill(); }
  c.strokeStyle = 'rgba(255,220,160,0.07)'; c.lineWidth = 2;
  for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(W / 2 + i * W * 0.02, hz); c.lineTo(W / 2 + i * W * 0.22, H); c.stroke(); }
  c.fillStyle = 'rgba(30,20,10,0.3)';
  for (let i = 0; i < 18; i++) { const y = hz + (H - hz) * Math.pow(((i * 53) % 17) / 17, 1.6), s = (y - hz) / (H - hz); ell(c, ((i * 71) % 97) / 97 * W, y, W * 0.02 * (0.3 + s), H * 0.006 * (0.3 + s)); c.fill(); }
  if (env !== 'sea') for (const sd of [-1, 1]) { // dương xỉ tiền cảnh 2 góc
    const bx = sd < 0 ? 0 : W;
    for (let k = 0; k < 7; k++) {
      const a = (sd < 0 ? -0.15 : Math.PI + 0.15) - sd * k * 0.17, len = H * (0.28 + 0.05 * Math.sin(k * 2));
      c.strokeStyle = env === 'night' ? (k % 2 ? '#0c1a10' : '#12241a') : k % 2 ? '#1f3a1c' : '#2b4d24'; c.lineWidth = W * 0.012; c.lineCap = 'round';
      const ex = bx + Math.cos(a - sd * 0.9) * len, ey = H - Math.abs(Math.sin(a - sd * 0.9)) * len;
      c.beginPath(); c.moveTo(bx, H); c.quadraticCurveTo((bx + ex) / 2, ey - H * 0.05, ex, ey); c.stroke();
    }
  }
}
export function drawDinoBg(r, t, env = 'plains') {
  const { ctx, W, H } = r, hz = H * 0.42;
  const key = `${W}x${H}:${env}`;
  r._dinoBgs ||= {};
  let cv = r._dinoBgs[key];
  if (!cv) { cv = document.createElement('canvas'); cv.width = W; cv.height = H; paintBg(cv.getContext('2d'), W, H, env); r._dinoBgs = { [key]: cv }; }
  ctx.drawImage(cv, 0, 0);
  if (env === 'plains' || env === 'night') for (let i = 0; i < 5; i++) { // khói núi lửa
    const k = ((t * 0.08 + i / 5) % 1), x = W * (0.73 + k * 0.05 * Math.sin(i)), y = hz - H * (0.25 + k * 0.25);
    ctx.fillStyle = `rgba(60,40,60,${0.35 * (1 - k)})`; ell(ctx, x, y, W * (0.02 + k * 0.05), H * (0.02 + k * 0.04)); ctx.fill();
  }
  if (env === 'sea') for (let i = 0; i < 6; i++) { const y = hz + H * (0.03 + i * 0.03); ctx.strokeStyle = `rgba(255,255,255,${0.25 - i * 0.03})`; ctx.lineWidth = 2; ctx.beginPath(); for (let x = 0; x <= W; x += W / 40) ctx.lineTo(x, y + Math.sin(x * 0.03 + t * 2 + i) * 3); ctx.stroke(); }
}
/** Lớp mặt nước PHÍA TRƯỚC (che phần thân dưới của cá sấu / mosasaur; khủng long trên cạn lội nước nông). */
export function drawWaterFront(r, t, env, level) {
  if (env !== 'river' && env !== 'sea') return;
  const { ctx, W, H } = r, y0 = H * level;
  const g = ctx.createLinearGradient(0, y0, 0, H);
  if (env === 'sea') { g.addColorStop(0, 'rgba(60,150,200,0.85)'); g.addColorStop(1, 'rgba(20,70,120,0.95)'); } else { g.addColorStop(0, 'rgba(90,120,105,0.85)'); g.addColorStop(1, 'rgba(40,60,50,0.95)'); }
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += W / 48) ctx.lineTo(x, y0 + Math.sin(x * 0.02 + t * 2.2) * H * 0.006 + Math.sin(x * 0.007 - t) * H * 0.008);
  ctx.lineTo(W, H); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = 0; x <= W; x += W / 48) ctx.lineTo(x, y0 + Math.sin(x * 0.02 + t * 2.2) * H * 0.006 + Math.sin(x * 0.007 - t) * H * 0.008);
  ctx.stroke();
}
/** Vật bay tới: đá, mảnh vụn, cá, thằn lằn. */
export function drawProjectile(ctx, kind, x, y, r, t) {
  if (kind === 'fish') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 12) * 0.4);
    const g = ctx.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#5f8fb0'); g.addColorStop(1, '#d8e8f0');
    ell(ctx, 0, 0, r * 1.2, r * 0.55); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 1.05, 0); ctx.lineTo(r * 1.7, -r * 0.55); ctx.lineTo(r * 1.7, r * 0.55); ctx.fillStyle = '#4a7a9a'; ctx.fill();
    ell(ctx, -r * 0.7, -r * 0.12, r * 0.12, r * 0.12); ctx.fillStyle = '#111'; ctx.fill(); ctx.restore(); return;
  }
  if (kind === 'lizard') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 6);
    ctx.strokeStyle = '#3f8a3a'; ctx.lineWidth = r * 0.45; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, -r * 0.5, r, 0); ctx.stroke();
    ctx.lineWidth = r * 0.18; for (const sx of [-0.4, 0.4]) { ctx.beginPath(); ctx.moveTo(r * sx, 0); ctx.lineTo(r * sx - r * 0.2, r * 0.5); ctx.moveTo(r * sx, 0); ctx.lineTo(r * sx + r * 0.2, -r * 0.6); ctx.stroke(); }
    ctx.restore(); return;
  }
  drawRock(ctx, x, y, r * (kind === 'debris' ? 0.8 : 1), t, kind === 'debris' ? ['#a08060', '#4a3420'] : undefined);
}

/** Tảng đá bay tới (z: 1 xa → 0 sát mặt). */
export function drawRock(ctx, x, y, r, t, cols = ['#b9b2a6', '#4b443c']) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3);
  ctx.beginPath();
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, rr = r * (0.82 + 0.18 * Math.sin(i * 2.3)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#2b2620'; ctx.lineWidth = r * 0.06; ctx.stroke();
  ctx.restore();
}

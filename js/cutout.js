// Cắt từng người ra khỏi hình camera bằng mặt nạ tách người của MediaPipe → ảnh người nền trong suốt.
// Dùng ở kiểu hiển thị "Khung cảnh game": người được THU NHỎ theo tỉ lệ chọn và đặt đứng trên đường đua / ô,
// nền phòng thật được thay bằng khung cảnh game (không còn bị môi trường làm mờ giao diện).
import { LM } from './pose.js';

const vis = (p, m = 0.5) => !!p && p.v >= m;

export class Cutouts {
  constructor() { this.items = []; this.pool = []; }

  /**
   * @param frame canvas ảnh đã dùng để nhận diện (cùng toạ độ với mặt nạ)
   * @param masks [{w,h,data:Float32Array}] theo đúng thứ tự `all`
   * @param all   landmark chuẩn hoá của từng người
   */
  update(frame, masks, all) {
    if (!frame || !masks || !masks.length) { this.items = []; return this.items; }
    const fw = frame.width, fh = frame.height;
    const src = frame.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, fw, fh).data;
    this.items = all.map((lm, i) => {
      const m = masks[i];
      if (!m || m.w !== fw || m.h !== fh) return null;
      const pts = lm.filter(p => p.v > 0.3);
      if (pts.length < 6) return null;
      // khung bao quanh người (nới rộng để không cụt tay / tóc)
      let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
      let y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
      const w = x1 - x0, h = y1 - y0;
      x0 -= w * 0.35 + 0.03; x1 += w * 0.35 + 0.03; y0 -= h * 0.18 + 0.03; y1 += h * 0.08 + 0.02;
      const bx = Math.max(0, Math.floor(x0 * fw)), by = Math.max(0, Math.floor(y0 * fh));
      const bw = Math.min(fw, Math.ceil(x1 * fw)) - bx, bh = Math.min(fh, Math.ceil(y1 * fh)) - by;
      if (bw < 8 || bh < 8) return null;
      const out = new ImageData(bw, bh), d = out.data, md = m.data;
      for (let y = 0; y < bh; y++) {
        let si = (by + y) * fw + bx, di = y * bw * 4;
        for (let x = 0; x < bw; x++, si++, di += 4) {
          const a = md[si];
          if (a < 0.3) continue; // ngoài người: trong suốt
          const k = si * 4;
          d[di] = src[k]; d[di + 1] = src[k + 1]; d[di + 2] = src[k + 2];
          d[di + 3] = a > 0.6 ? 255 : ((a - 0.3) / 0.3) * 255; // viền mềm
        }
      }
      const cv = this.pool[i] || (this.pool[i] = document.createElement('canvas'));
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      cv.getContext('2d').putImageData(out, 0, 0);
      // điểm chân (thấp nhất trong mắt cá / gót / mũi chân) và đỉnh đầu, theo pixel của khung nhận diện
      const feetIdx = [LM.L_AN, LM.R_AN, 29, 30, 31, 32].filter(k => vis(lm[k]));
      const feetSeen = feetIdx.length >= 2;
      const feetY = feetSeen ? Math.max(...feetIdx.map(k => lm[k].y)) : null;
      const ls = lm[LM.L_SH], rs = lm[LM.R_SH];
      const cx = vis(ls, 0.3) && vis(rs, 0.3) ? (ls.x + rs.x) / 2 : (x0 + x1) / 2;
      const shoulderPx = vis(ls, 0.3) && vis(rs, 0.3) ? Math.hypot((ls.x - rs.x) * fw, (ls.y - rs.y) * fh) : null;
      const headPx = vis(lm[LM.NOSE], 0.3) ? lm[LM.NOSE].y * fh - (shoulderPx ? shoulderPx * 0.75 : fh * 0.05) : y0 * fh;
      return {
        canvas: cv, bx, by, fw, fh,
        feetSeen, footPx: feetSeen ? { x: (feetIdx.reduce((a, k) => a + lm[k].x, 0) / feetIdx.length) * fw, y: feetY * fh } : null,
        cxPx: cx * fw, headPx, shoulderPx, bottomPx: by + bh,
      };
    });
    return this.items;
  }
}

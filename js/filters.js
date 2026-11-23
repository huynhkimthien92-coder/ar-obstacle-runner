// One Euro Filter — lọc rung landmark nhưng vẫn phản hồi nhanh khi chuyển động nhanh (nhảy).
// Đơn vị: toạ độ chuẩn hoá 0..1, thời gian ms.

class LowPass {
  constructor() { this.y = null; }
  filter(x, a) { this.y = this.y === null ? x : a * x + (1 - a) * this.y; return this.y; }
  reset() { this.y = null; }
}

const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuro {
  constructor(minCutoff = 2.0, beta = 3.0, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = new LowPass(); this.dx = new LowPass();
    this.prev = null; this.tPrev = null;
  }
  filter(value, tMs) {
    if (this.tPrev === null) {
      this.tPrev = tMs; this.prev = value;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const edx = this.dx.filter((value - this.prev) / dt, alpha(this.dCutoff, dt));
    this.prev = value;
    return this.x.filter(value, alpha(this.minCutoff + this.beta * Math.abs(edx), dt));
  }
  reset() { this.x.reset(); this.dx.reset(); this.prev = null; this.tPrev = null; }
}

export class PoseSmoother {
  constructor(n = 33) {
    this.fx = Array.from({ length: n }, () => new OneEuro());
    this.fy = Array.from({ length: n }, () => new OneEuro());
    this.lastSeen = 0;
  }
  apply(landmarks, tMs) {
    if (!landmarks) return null;
    if (tMs - this.lastSeen > 500) this.reset(); // mất người >0.5s → reset để không "kéo" từ vị trí cũ
    this.lastSeen = tMs;
    return landmarks.map((p, i) => ({
      x: this.fx[i].filter(p.x, tMs), y: this.fy[i].filter(p.y, tMs), z: p.z, v: p.v,
    }));
  }
  reset() { this.fx.forEach(f => f.reset()); this.fy.forEach(f => f.reset()); }
}

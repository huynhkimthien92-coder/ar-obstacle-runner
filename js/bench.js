// Đo hiệu năng ngay trên máy người chơi (Performance Benchmarker): FPS render, thời gian suy luận pose,
// độ trễ camera→pose (khi trình duyệt có requestVideoFrameCallback.captureTime). Xuất JSON để gom báo cáo.

class Ring {
  constructor(n = 600) { this.a = new Float32Array(n); this.n = n; this.i = 0; this.len = 0; }
  push(v) { this.a[this.i] = v; this.i = (this.i + 1) % this.n; this.len = Math.min(this.n, this.len + 1); }
  values() { return Array.from(this.a.slice(0, this.len)); }
  clear() { this.i = 0; this.len = 0; }
}

export function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
const stats = arr => arr.length ? {
  n: arr.length, mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
  p50: +pct(arr, 50).toFixed(2), p95: +pct(arr, 95).toFixed(2), max: +Math.max(...arr).toFixed(2),
} : null;

export class Bench {
  constructor() {
    this.frame = new Ring(); this.infer = new Ring(); this.latency = new Ring(); this.poseHz = new Ring(200);
    this.lastPoseAt = 0; this.frameMeta = null; this.lostFrames = 0; this.poseFrames = 0;
    this.startedAt = performance.now(); this.info = {};
  }
  reset() { [this.frame, this.infer, this.latency, this.poseHz].forEach(r => r.clear()); this.lostFrames = this.poseFrames = 0; this.startedAt = performance.now(); }

  /** Gắn rVFC để biết thời điểm camera chụp frame → tính trễ thật camera→kết quả pose. */
  watchVideo(video) {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return;
    const cb = (now, meta) => { this.frameMeta = meta; video.requestVideoFrameCallback(cb); };
    video.requestVideoFrameCallback(cb);
  }

  onFrame(dtMs) { if (dtMs > 0 && dtMs < 500) this.frame.push(dtMs); }
  onPose(ms, hasPerson) {
    const now = performance.now();
    this.infer.push(ms); this.poseFrames++;
    if (!hasPerson) this.lostFrames++;
    if (this.lastPoseAt) this.poseHz.push(now - this.lastPoseAt);
    this.lastPoseAt = now;
    const cap = this.frameMeta?.captureTime;
    if (cap && now - cap < 1000) this.latency.push(now - cap);
  }

  live() {
    const f = this.frame.values().slice(-60), i = this.infer.values().slice(-30), l = this.latency.values().slice(-30), h = this.poseHz.values().slice(-30);
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    return {
      fps: f.length ? 1000 / avg(f) : 0, poseFps: h.length ? 1000 / avg(h) : 0,
      inferMs: avg(i), latencyMs: l.length ? avg(l) : null,
    };
  }

  report(extra = {}) {
    const frame = this.frame.values(), poseInt = this.poseHz.values();
    const fpsArr = frame.map(d => 1000 / d);
    return {
      app: 'ar-obstacle-runner', generatedAt: new Date().toISOString(), durationSec: +((performance.now() - this.startedAt) / 1000).toFixed(1),
      device: {
        ua: navigator.userAgent, cores: navigator.hardwareConcurrency ?? null, memoryGB: navigator.deviceMemory ?? null,
        screen: `${screen.width}x${screen.height}@${window.devicePixelRatio}`, ...this.info,
      },
      renderFrameMs: stats(frame),
      renderFps: { p5_low: fpsArr.length ? +pct(fpsArr, 5).toFixed(1) : null, p50: fpsArr.length ? +pct(fpsArr, 50).toFixed(1) : null },
      poseInferenceMs: stats(this.infer.values()),
      poseIntervalMs: stats(poseInt),
      cameraToPoseLatencyMs: stats(this.latency.values()),
      personLostRatio: this.poseFrames ? +(this.lostFrames / this.poseFrames).toFixed(3) : null,
      targets: { renderFpsP50: '>=30', poseInferenceP95Ms: '<=40', cameraToPoseP95Ms: '<=100' },
      ...extra,
    };
  }
}

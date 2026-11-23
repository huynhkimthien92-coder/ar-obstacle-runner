// Wrapper MediaPipe Pose Landmarker (free, chạy hoàn toàn trên máy người chơi — không gửi ảnh lên server).
import { CONFIG } from './config.js';

export const LM = {
  NOSE: 0, L_SH: 11, R_SH: 12, L_EL: 13, R_EL: 14, L_WR: 15, R_WR: 16,
  L_HIP: 23, R_HIP: 24, L_KN: 25, R_KN: 26, L_AN: 27, R_AN: 28,
};

export const SKELETON = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
];

export class PoseEngine {
  constructor() {
    this.landmarker = null; this.delegate = null; this.model = null;
    this.lastVideoTime = -1; this.lastTs = 0;
  }

  async init(model = 'lite', onStatus = () => {}) {
    onStatus('Đang tải MediaPipe…');
    const { FilesetResolver, PoseLandmarker } = await import(CONFIG.VISION_BUNDLE_URL);
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.WASM_BASE);
    let lastErr;
    // GPU (WebGL) nhanh hơn nhiều; một số máy Android/iOS cũ lỗi GPU → rơi về CPU (WASM)
    for (const delegate of ['GPU', 'CPU']) {
      try {
        onStatus(`Đang tải model ${model} (${delegate})…`);
        this.landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: CONFIG.MODELS[model], delegate },
          runningMode: 'VIDEO', numPoses: 1,
          minPoseDetectionConfidence: CONFIG.POSE.detect, minPosePresenceConfidence: CONFIG.POSE.presence, minTrackingConfidence: CONFIG.POSE.track,
          outputSegmentationMasks: false,
        });
        this.delegate = delegate; this.model = model; this.numPoses = 1; this.seg = false;
        return this;
      } catch (e) { lastErr = e; console.warn('[pose] delegate', delegate, 'lỗi:', e); }
    }
    throw lastErr;
  }

  /**
   * Trả null nếu chưa có frame camera mới. Ảnh camera được thu về khung rộng 640px trước khi nhận diện:
   * nhanh hơn, và mặt nạ tách người (segmentation) nhỏ gọn để cắt người ra khỏi nền.
   */
  detect(video) {
    if (!this.landmarker || video.readyState < 2 || !video.videoWidth || video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;
    const fw = 640, fh = Math.round(640 * video.videoHeight / video.videoWidth);
    if (!this.frame) { this.frame = document.createElement('canvas'); this.fctx = this.frame.getContext('2d', { willReadFrequently: true }); }
    if (this.frame.width !== fw || this.frame.height !== fh) { this.frame.width = fw; this.frame.height = fh; }
    this.fctx.drawImage(video, 0, 0, fw, fh);
    const ts = Math.max(performance.now(), this.lastTs + 1); // timestamp phải tăng dần
    this.lastTs = ts;
    const t0 = performance.now();
    const res = this.landmarker.detectForVideo(this.frame, ts);
    const ms = performance.now() - t0;
    const all = (res?.landmarks || []).map(lm => lm.map(p => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 1 })));
    // mặt nạ phải chép ra TRƯỚC khi close() (bộ nhớ của MediaPipe bị thu hồi sau đó)
    const masks = this.seg && res?.segmentationMasks ? res.segmentationMasks.map(m => ({ w: m.width, h: m.height, data: m.getAsFloat32Array() })) : null;
    res?.close?.();
    // người "chính" (điều khiển menu / game chạy): người có vai gần giữa khung nhất
    let landmarks = null, best = Infinity;
    for (const lm of all) { const d = Math.abs((lm[11].x + lm[12].x) / 2 - 0.5); if (d < best) { best = d; landmarks = lm; } }
    return { landmarks, all, masks, frame: this.frame, ms, ts };
  }

  /** Bật/tắt mặt nạ tách người (chỉ cần ở kiểu hiển thị "Khung cảnh game"). */
  async setSegmentation(on) {
    if (!this.landmarker || this.seg === on) return;
    try { await this.landmarker.setOptions({ outputSegmentationMasks: on }); this.seg = on; } catch (e) { console.warn('[pose] seg', e); this.seg = false; }
  }

  /** Game "Ô an toàn" cần thấy nhiều người cùng lúc. */
  async setNumPoses(n) {
    if (!this.landmarker || this.numPoses === n) return;
    try { await this.landmarker.setOptions({ numPoses: n }); this.numPoses = n; } catch (e) { console.warn('[pose] setNumPoses', e); }
  }

  close() { this.landmarker?.close(); this.landmarker = null; }
}

/** Phủ kín (cover) nếu tỉ lệ camera gần tỉ lệ màn hình; lệch nhiều (vd. camera dọc trên TV ngang) thì hiện nguyên khung (contain) để không cắt mất đầu/chân. */
export const fitFor = (vw, vh, W, H) => (Math.abs(vw / vh - W / H) / (W / H) < 0.25 ? 'cover' : 'contain');

/** Đổi toạ độ chuẩn hoá của video → pixel CSS trên màn hình (có thể lật gương). */
export function makeMapper(vw, vh, W, H, mirrored, fit = 'cover') {
  const s = fit === 'contain' ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
  return p => {
    let x = ox + p.x * dw;
    if (mirrored) x = W - x;
    return { x, y: oy + p.y * dh, v: p.v };
  };
}

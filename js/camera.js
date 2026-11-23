import { CONFIG } from './config.js';

let current = null;

export function cameraSupport() {
  if (!window.isSecureContext) return { ok: false, reason: 'Camera chỉ chạy trên HTTPS (hoặc localhost). Hãy mở bằng link https://.' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'Trình duyệt này không hỗ trợ camera (getUserMedia).' };
  return { ok: true };
}

export function explainCameraError(e) {
  switch (e?.name) {
    case 'NotAllowedError': case 'SecurityError':
      return 'Bạn chưa cho phép camera. Mở cài đặt trang (biểu tượng ổ khoá / "aA") → Camera → Cho phép, rồi tải lại.';
    case 'NotFoundError': case 'OverconstrainedError':
      return 'Không tìm thấy camera phù hợp trên thiết bị.';
    case 'NotReadableError': case 'AbortError':
      return 'Camera đang bị ứng dụng khác dùng. Đóng app đó rồi thử lại.';
    default: return 'Không mở được camera: ' + (e?.message || e);
  }
}

/** tv=true: xin khung 16:9 (khớp TV, không bị cắt mất chân khi phủ kín màn hình 16:9) */
export async function startCamera(video, facing = 'user', tv = false) {
  stopCamera();
  const { fps } = CONFIG.CAMERA;
  const width = tv ? CONFIG.CAMERA.tvWidth : CONFIG.CAMERA.width, height = tv ? CONFIG.CAMERA.tvHeight : CONFIG.CAMERA.height;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: facing, width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps, max: fps } },
    });
  } catch (e) {
    if (e?.name !== 'OverconstrainedError') throw e;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true }); // thiết bị kén constraint
  }
  video.setAttribute('playsinline', ''); // bắt buộc cho iOS Safari, nếu không video bật fullscreen
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise(r => video.addEventListener('loadedmetadata', r, { once: true }));
  const track = stream.getVideoTracks()[0];
  current = { stream, facing, settings: track?.getSettings?.() || {} };
  return { ...current, width: video.videoWidth, height: video.videoHeight };
}

export function stopCamera() {
  current?.stream.getTracks().forEach(t => t.stop());
  current = null;
}

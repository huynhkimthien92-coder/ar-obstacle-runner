// Cấu hình trung tâm. Mọi con số gameplay đều là PLACEHOLDER cho tới khi playtest xác nhận
// (nguyên tắc Game Designer: đánh dấu số chưa test là placeholder).

const TV = '1.2.3'; // @mediapipe/tasks-vision — pin version để tránh vỡ khi CDN cập nhật

export const CONFIG = {
  TASKS_VISION_VERSION: TV,
  // Muốn tự host (không phụ thuộc CDN): copy node_modules/@mediapipe/tasks-vision vào ./vendor/tasks-vision
  // rồi đổi 2 dòng dưới thành './vendor/tasks-vision/vision_bundle.mjs' và './vendor/tasks-vision/wasm'
  VISION_BUNDLE_URL: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TV}/vision_bundle.mjs`,
  WASM_BASE: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TV}/wasm`,
  MODELS: {
    lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  },

  CAMERA: { width: 960, height: 540, tvWidth: 960, tvHeight: 540, fps: 30 },
  // Ngưỡng tin cậy MediaPipe (mặc định của Google là 0.5) — hạ xuống để bám người ở xa / thiếu sáng tốt hơn
  POSE: { detect: 0.4, presence: 0.4, track: 0.4 },
  LOST_PAUSE_SEC: 2.0, // mất người liên tục bao lâu thì tạm dừng game

  // Ngưỡng nhận diện động tác (tỉ lệ theo chiều dài thân = vai→hông lúc hiệu chỉnh)
  MOTION: {
    jumpEnter: 0.16, jumpExit: 0.08,   // hông nâng lên ≥16% thân → đang nhảy
    duckEnter: 0.22, duckExit: 0.12,   // vai hạ xuống ≥22% thân → đang ngồi
    laneHyst: 0.04,                    // trễ chuyển làn (tỉ lệ bề ngang màn hình)
    adaptRate: 0.02,                   // tốc độ baseline bám theo trôi tư thế khi đứng yên
    maxAirborneMs: 1200,               // nhảy >1.2s là bất khả thi → coi là trôi baseline, hiệu chỉnh lại
    maxDuckMs: 3500,
    visMin: 0.5,                       // hông / mắt cá
    shoulderVis: 0.35,                 // chỉ BẮT BUỘC thấy 2 vai → khó mất dấu hơn
    torsoPerShoulder: 1.4,             // hông khuất: thân ≈ 1.4 × bề rộng vai
    coastMs: 600,                      // mất dấu < 0.6s → giữ nguyên trạng thái (không giật / không tính mất người)
    nearShoulderMin: 0.15, nearShoulderMax: 0.5, // chế độ đứng gần: bề rộng vai / bề ngang khung
    rebaseMs: 400, rebaseShoulderJump: 0.25, // quay lại khung / đổi chỗ đột ngột → lấy lại baseline trong 0.4s
    calibSamples: 8, calibMs: 900,
  },

  GAME: {
    lanes: 3,
    viewDist: 60,          // m — khoảng nhìn thấy phía trước
    speedStart: 7,         // m/s  (người thật phản xạ chậm hơn ngón tay → bắt đầu chậm)
    speedMax: 15,
    speedRamp: 0.045,      // m/s mỗi giây
    lives: 3,
    invulnMs: 1500,
    forgiveMs: 250,        // bù trễ camera→pose: nhảy/ngồi trong 250ms trước khi chạm vẫn tính
    lateMs: 120,           // và né muộn tối đa 120ms sau khi chạm vẫn tính (người phản ứng sau khi thấy)
    chunkGapSec: 1.4,
    coinScore: 10, starScore: 50, dodgeScore: 5,
    comboMax: 5,
    tierDistance: [0, 250, 700, 1400], // m để mở khoá tier 1..3 (tier 0 = hướng dẫn)
    displayLagMs: 0,       // bù độ trễ màn hình: xét va chạm muộn hơn đúng bằng độ trễ TV
  },

  RENDER: { maxDpr: 2, horizon: 0.36, focal: 6, ppmAtPlayer: 0.28 },

  // Chế độ TV / máy chiếu
  TV: { width: 1280, height: 720, streamFps: 30, bitrate: 4_000_000 },
  // Độ trễ hiển thị mặc định (ms) theo cách nối — được thay bằng số đo thật sau mini-game "đo độ trễ"
  LAG: { phone: 0, tv: 220, wifi: 200, max: 600 },
  // Ghép nối điện thoại ↔ TV qua WebRTC. Máy chủ ghép nối PeerJS cloud miễn phí (chỉ trao đổi mã kết nối,
  // hình/tiếng đi thẳng trong mạng Wi-Fi nhà bạn). server: null = dùng 0.peerjs.com
  PEER: { lib: 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js', prefix: 'aor-tv-', server: null },
};

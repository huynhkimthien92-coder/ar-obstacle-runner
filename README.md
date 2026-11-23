# AR Obstacle Runner

Game vận động kiểu console cho phòng khách: **điện thoại = máy chơi + camera** (đặt nằm ngang dưới TV, như Kinect), **TV / máy chiếu = màn hình**. MediaPipe nhận diện cơ thể ngay trên điện thoại; người chơi thấy chính mình trên màn hình lớn, **bước** né tường, **nhảy** qua hố lửa / rào, **ngồi** tránh laser, **giơ tay** hái sao. Webgame/PWA chạy Android & iOS — không server game, không app store, 0 đ.

**Đưa hình lên TV:** cáp HDMI · phản chiếu màn hình (Smart View / Chromecast / AirPlay) · hoặc màn hình phụ qua Wi-Fi (TV/laptop mở `display.html`, nhập mã 4 số). Chi tiết: **[docs/TV_SETUP.md](docs/TV_SETUP.md)**.

## Chạy nhanh
- Deploy: xem **[docs/HUONG_DAN_DEPLOY.md](docs/HUONG_DAN_DEPLOY.md)** (GitHub Pages, chỉ cần trình duyệt).
- Không có camera / muốn thử nhanh: nút **"Chơi thử bằng vuốt / phím"** (← → ↑ ↓, H).
- Thông số hiệu năng: thêm `?debug=1` vào URL.

## Cấu trúc
```
index.html            máy chơi (điện thoại): menu, hiệu chỉnh, đo độ trễ, chơi, kết thúc
display.html          trang màn hình cho TV có trình duyệt / laptop nối máy chiếu (nhận stream Wi-Fi)
manifest.webmanifest  PWA
sw.js                 service worker (cache app + MediaPipe để chơi offline)
css/style.css
js/config.js          ★ mọi thông số tuning + URL CDN/model
js/camera.js          getUserMedia, xử lý lỗi quyền
js/pose.js            MediaPipe Pose Landmarker (GPU→CPU), map toạ độ video→màn hình
js/filters.js         One Euro filter chống rung landmark
js/motion.js          landmark → làn / nhảy / ngồi / giơ tay / khoảng cách (thuần logic)
js/levels.js          ★ bản đồ chướng ngại vật (chunk)
js/game.js            vòng lặp thế giới, spawn, va chạm, điểm (thuần logic)
js/render.js          Canvas 2D: đường chạy phối cảnh, lửa, laser, khung xương, hiệu ứng
js/audio.js           âm thanh tổng hợp WebAudio (0 file asset)
js/bench.js           đo FPS / suy luận / trễ camera→pose, xuất JSON
js/link.js            WebRTC điện thoại → TV (PeerJS ghép nối bằng mã 4 số)
js/display.js         phía TV: hiện mã, phát stream độ trễ thấp
js/main.js            điều phối luồng màn, cách xuất hình, đo độ trễ, input
tests/                node --test: nhận diện động tác + bot chứng minh mọi chunk giải được
docs/                 GDD, bản đồ, free-tier, checklist iOS/Android, hiệu năng, deploy
```

## Đầu ra theo kế hoạch
| Giai đoạn | Đầu ra | Ở đâu |
|---|---|---|
| 1 · Rapid Prototyper | POC camera + pose chạy trên mobile browser | toàn bộ app; `js/camera.js`, `js/pose.js` |
| 1 · Rapid Prototyper | Báo cáo giới hạn free-tier | `docs/FREE_TIER_LIMITS.md` |
| 1 · AI Engineer | Pipeline pose detection | `js/pose.js` → `js/filters.js` → `js/motion.js` |
| 1 · AI Engineer | Skeleton overlay demo | màn hiệu chỉnh + khi chơi (`Renderer.skeleton`) |
| 2 · Game Designer | GDD ngắn | `docs/GDD.md` |
| 2 · Game Designer | Bản đồ chướng ngại vật | `docs/OBSTACLE_MAP.md`, `js/levels.js` |
| 2 · Frontend Developer | Game loop 30fps+ mobile | `js/main.js` (rAF, tự giảm chất lượng) |
| 2 · Frontend Developer | Collision vs pose | `Game._resolve` + cửa sổ bù trễ |
| 2 · XR Immersive Dev | AR scene prototype | overlay Canvas 2D lên camera (lý do không dùng WebXR: `js/render.js` đầu file) |
| 2 · XR Immersive Dev | Depth estimation đơn giản | `MotionTracker` → `distance` (nhắc lùi/tiến, ước lượng mét) |
| 3 · Mobile App Builder | PWA manifest + service worker | `manifest.webmanifest`, `sw.js` |
| 3 · Mobile App Builder | Checklist iOS/Android | `docs/COMPAT_CHECKLIST.md` |
| 3 · Performance Benchmarker | Báo cáo performance | `docs/PERFORMANCE.md` + nút xuất JSON trong app |
| 3 · Performance Benchmarker | Danh sách tối ưu ưu tiên | `docs/PERFORMANCE.md` §5 |
| Bổ sung · TV / máy chiếu | Chế độ TV 16:9, HDMI/phản chiếu, màn hình phụ Wi-Fi, đo & bù độ trễ | `docs/TV_SETUP.md`, `display.html`, `js/link.js` |

## Quyền riêng tư
Hình camera chỉ xử lý trên điện thoại của người chơi, không upload. Ở chế độ Wi-Fi, hình chỉ đi thẳng từ điện thoại tới TV trong mạng nhà bạn. Kỷ lục / phản hồi lưu localStorage trên máy.

## Giấy phép thành phần
MediaPipe Tasks Vision & model Pose Landmarker: Apache-2.0 (Google).

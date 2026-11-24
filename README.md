# AR Obstacle Runner

Game vận động kiểu console cho phòng khách: **điện thoại = máy chơi + camera** (đặt nằm ngang dưới TV, như Kinect), **TV / máy chiếu = màn hình**. MediaPipe nhận diện cơ thể ngay trên điện thoại; người chơi thấy chính mình trên màn hình lớn, **bước** né tường, **nhảy** qua hố lửa / rào, **ngồi** tránh laser, **giơ tay** hái sao. Webgame/PWA chạy Android & iOS — không server game, không app store, 0 đ.

**5 trò chơi** (chọn ở menu):
- 🏃 **Vượt chướng ngại** (1 người): bước né tường, nhảy qua hố lửa / rào, ngồi tránh laser, giơ tay hái sao.
- 🔥 **Ô an toàn** (1–4 người): sàn trước camera thành lưới ô, mỗi vòng ô xanh/đỏ đổi ngẫu nhiên; hết giờ phải đứng trên ô xanh, ô đỏ là hố lửa. Người trụ lại cuối cùng thắng.
- 🍉 **Chém trái cây** (1–2 người, 2 người = đối kháng): vung 2 tay chém trái rơi từ trên xuống, né bom; người thu nhỏ ở đáy, lưỡi chém theo hướng vươn tay nên không cần với cao.
- 🦖 **Đấu khủng long** (1 người): 16 loài qua 4 màn lao tới nhìn thẳng vào bạn — đánh điểm yếu; màu báo việc phải làm (đỏ né · vàng nhảy · tím ngồi · xanh giơ tay · trắng đập); combo, giả đòn, bầy đàn, khoá sừng, trùm cuối màn.
- 💃 **Vũ hội công chúa** (1 người): nhảy kiểu Audition cùng 3 công chúa 3D — làm đúng chuỗi động tác tay/ngồi rồi **vỗ tay đúng phách**; PERFECT / FEVER / FINISH MOVE. **Nhập nhạc của bạn** (mp3, m4a…), game tự dò nhịp BPM. Có mức **👶 Bé 4–6 tuổi**: mũi tên như Audition ⬅ ➡ ⬆ ⬇ + xoay 1 vòng, mỗi lượt 1 động tác, giọng đọc hướng dẫn, chỉ khen không chê.

**Chơi ngay trên điện thoại (không cần TV):** dựng máy dọc ngang tầm mắt, đứng gần ~1–1,5 m — game tự dùng khung nửa người (chỉ cần thấy đầu tới hông). Gợi ý động tác hiện thành viền màu + mũi tên lớn + âm báo nên không cần nhìn kỹ màn hình.

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
js/tiles.js           ★ game Ô an toàn: lưới ô phối cảnh, vòng chơi, độ khó, mạng, loại
js/fruits.js          ★ game Chém trái cây: rơi, chém (đoạn thẳng cắt hình tròn + tốc độ tay), bom, combo
js/dino.js            ★ game Đấu khủng long: loài, đòn tấn công, cửa sổ phản ứng có bù trễ, điểm yếu, đá bay
js/dinodraw.js        ★ biên đạo động tác theo mẫu đòn + nền 5 cảnh (rừng, sông, biển, hoàng hôn, đêm)
js/dinospecies.js     ★ vẽ 12 loài mới chính diện; js/dinokit.js: bộ dụng cụ vẽ dùng chung
js/dance.js           ★ game Vũ hội: tạo lượt theo nhịp, chuỗi động tác, chấm vỗ tay theo phách, FEVER
js/beat.js            ★ dò BPM / phách / năng lượng từ file nhạc (thuần JS)
js/music.js           bài có sẵn tự tổng hợp, nhập + lưu nhạc (IndexedDB), trình phát có bù trễ loa
js/voice.js           giọng đọc tiếng Việt (Web Speech) cho chế độ bé
js/dancepose.js       ★ nhận diện 6 động tác + vỗ tay (góc tay, chống chớp, bắt vỗ nhanh)
js/princess3d.js      công chúa 3D: mẫu VRM CC0 + váy dạ hội + vương miện, điều khiển xương theo động tác
js/princess.js        sảnh lâu đài, icon động tác, công chúa 2D dự phòng
js/vendor/three-0.170/ three.js + three-vrm (MIT), chỉ tải khi vào Vũ hội
assets/princess/v1/   3 mẫu VRoid CC0 đã thu nhỏ (xem LICENSE.txt)
js/personcheck.js     ★ lọc người giả (đồ vật bị nhận nhầm)
js/cutout.js          tách người khỏi nền bằng mặt nạ MediaPipe (để thu nhỏ / đặt vào khung cảnh game)
js/players.js         theo dõi tối đa 4 người (gán ID giữa các khung hình, điểm chân trên sàn)
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
- Công chúa 3D: mẫu VRoid Studio "Victoria Rubin", "Darkness Shibu", "Vivi" — **CC0** (pixiv). three.js, @pixiv/three-vrm — MIT.
MediaPipe Tasks Vision & model Pose Landmarker: Apache-2.0 (Google).

# Báo cáo POC & giới hạn free-tier (Giai đoạn 1)

## Kết luận POC
Pipeline **camera → MediaPipe Pose → động tác → va chạm** chạy được hoàn toàn trong trình duyệt, **không cần server, chi phí 0 đ**.

Đã kiểm chứng trong sandbox (Chrome headless, camera giả phát video một nhân vật 3D đứng/bước/nhảy/ngồi):
- MediaPipe `@mediapipe/tasks-vision@1.2.3` + model `pose_landmarker_lite` khởi tạo được với **GPU delegate** (WebGL2).
- Nhận đúng 3 lần nhảy (hông nâng 0.29–0.32 thân), 3 lần ngồi (vai hạ 0.38–0.43 thân), đổi làn đúng chiều sau khi lật gương.
- Khung xương vẽ khớp người trên màn hình (đã xử lý crop `object-fit: cover` + lật gương camera trước).
- ⚠ Sandbox dùng GPU giả lập bằng CPU (SwiftShader) nên chỉ ~2.5 lần nhận diện/giây — **không phản ánh điện thoại thật**. Số đo thật lấy bằng chế độ benchmark trong app (xem PERFORMANCE.md).

## Ngăn xếp & chi phí
| Thành phần | Dùng gì | Chi phí | Giới hạn cần biết |
|---|---|---|---|
| Nhận diện cơ thể | MediaPipe Pose Landmarker (Apache-2.0), chạy trên máy người chơi | 0 | Lần đầu tải ~14 MB wasm + ~5.8 MB model (lite; bản full nặng hơn). Service worker cache lại → lần sau không tải |
| Thư viện JS/wasm | CDN jsDelivr (pin version 1.2.3) | 0 | Phụ thuộc CDN bên thứ ba; có thể tự host (xem dưới) |
| Model | Google Cloud Storage `storage.googleapis.com/mediapipe-models` | 0 | URL chính chủ của Google; nếu sau này đổi đường dẫn → tự host file `.task` |
| Render | Canvas 2D | 0 | Không WebGL/Three.js → nhẹ, chạy mọi máy |
| Hosting | GitHub Pages / Vercel Hobby (static) | 0, không cần thẻ | Xem bảng dưới |
| Ghép nối điện thoại ↔ TV (chỉ chế độ Wi-Fi) | PeerJS cloud (`0.peerjs.com`, miễn phí, MIT) | 0 | Chỉ trao đổi thông tin kết nối; hình/tiếng đi thẳng trong mạng Wi-Fi. Máy chủ công cộng không cam kết uptime → nếu cần chắc chắn, tự chạy `peer` (Node) trên host free rồi điền `CONFIG.PEER.server`. Không có TURN → hai máy phải cùng mạng |
| Xuất hình HDMI / phản chiếu | Tính năng có sẵn của điện thoại/TV | 0 (cáp HDMI tự mua nếu chưa có) | Không cần code riêng |
| Backend / DB | Không có | 0 | Kỷ lục, phản hồi lưu localStorage trên máy |
| Analytics | Không gửi đi đâu; xuất JSON thủ công | 0 | Muốn thống kê tập trung → v2 (ví dụ form miễn phí) |

### Hosting free (đều chạy HTTPS — bắt buộc để mở camera)
| Host | Băng thông free | Ghi chú |
|---|---|---|
| GitHub Pages | Giới hạn mềm 100 GB/tháng, site ≤ 1 GB | Upload qua giao diện web GitHub được, không cần CLI. Repo public (gói Free) |
| Vercel Hobby | 100 GB Fast Data Transfer/tháng | Chỉ dùng cá nhân, phi thương mại |

**Ước lượng:** mỗi người chơi mới tải từ host của bạn chỉ ~150 KB (code + icon) vì thư viện & model lấy từ CDN của jsDelivr/Google. 100 GB ≈ **hơn 600.000 lượt người chơi mới/tháng** → free-tier không phải điểm nghẽn. Nếu tự host cả wasm + model (~20 MB/người mới) thì còn ~5.000 người mới/tháng.

## Tự host (tuỳ chọn, khi không muốn phụ thuộc CDN)
1. Tải gói npm `@mediapipe/tasks-vision@1.2.3` (trên máy có mạng: `npm pack @mediapipe/tasks-vision@1.2.3`), giải nén, copy `vision_bundle.mjs` + thư mục `wasm/` vào `vendor/tasks-vision/`.
2. Tải `pose_landmarker_lite.task` từ URL trong `js/config.js` vào `vendor/`.
3. Sửa 3 dòng trong `js/config.js` trỏ tới `./vendor/...`. File wasm 14 MB < giới hạn 25 MB/file khi upload qua web GitHub.

## Giới hạn kỹ thuật đã biết
- **Bắt buộc HTTPS** (hoặc localhost). Mở file `index.html` trực tiếp (`file://`) sẽ không bật được camera.
- **Lần đầu cần mạng** để tải model. Sau đó chơi offline được (service worker).
- **iOS Safari không có WebXR AR** → dùng Canvas 2D overlay cho cả 2 nền tảng (đây cũng là lựa chọn đúng cho game này vì WebXR AR dùng camera *sau*, người chơi không thấy mình).
- **Depth estimation** dạng đơn giản: ước lượng khoảng cách từ chiều cao cơ thể trong khung hình (giả định FOV camera trước ~62° dọc) → chỉ dùng để nhắc "lùi ra / tiến lại", không dùng cho va chạm.

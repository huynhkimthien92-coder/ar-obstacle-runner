# Checklist tương thích iOS / Android

Đánh dấu khi test trên máy thật. Ghi model máy + phiên bản OS + kết quả JSON (Cài đặt → Xuất báo cáo hiệu năng).

## Chung (mọi máy)
- [ ] Mở link **https://** (không phải file://, không phải http://)
- [ ] Hỏi quyền camera → Cho phép → thấy hình mình (lật gương)
- [ ] Từ chối quyền → hiện hướng dẫn bật lại + vẫn chơi được chế độ vuốt
- [ ] Hiệu chỉnh xong trong < 3 s khi đứng yên ở ~2 m, thấy cả bàn chân
- [ ] Bước trái/phải đổi làn đúng chiều (bước sang trái của mình → người trên màn hình sang trái)
- [ ] Nhảy, ngồi, giơ tay được nhận; không nhảy giả khi chỉ bước ngang
- [ ] Giơ 2 tay để bắt đầu / chơi lại
- [ ] Ra khỏi khung > 1 s → game tự dừng, quay lại → chơi tiếp
- [ ] Màn hình không tự tắt khi đang chơi (Wake Lock)
- [ ] Xoay ngang màn hình → khung xương vẫn khớp người
- [ ] Lần 2 mở app khi **tắt mạng** → vẫn vào và chơi được (đã cache)
- [ ] Chế độ debug (`?debug=1` hoặc Cài đặt) hiện FPS, infer ms, cam→pose ms

## Android — Chrome
- [ ] Chrome bản mới (MediaPipe dùng WebGL2, không cần WebGPU)
- [ ] Nút "Cài app" hiện (beforeinstallprompt) → cài → mở từ màn hình chính ở chế độ toàn màn hình
- [ ] Rung khi bị đâm (navigator.vibrate)
- [ ] Máy tầm thấp (RAM ≤ 3 GB): nếu delegate = CPU hoặc infer > 45 ms → app tự bỏ cách 1 frame; ghi lại FPS
- [ ] Samsung Internet: mở được, camera chạy (nếu lỗi → khuyên dùng Chrome)

## iOS — Safari (và mọi trình duyệt trên iOS, vì đều dùng WebKit)
- [ ] iOS 16.4+ khuyến nghị (Wake Lock có từ 16.4); iOS 15 vẫn chạy nhưng màn hình có thể tự tắt
- [ ] Video không bật toàn màn hình riêng (đã có `playsinline`)
- [ ] Âm thanh chỉ chạy sau khi chạm nút (chính sách autoplay) — đã mở khoá ở nút "Chơi"
- [ ] Không rung (iOS không hỗ trợ Vibration API) — bình thường
- [ ] **Chạy trong tab Safari** ổn định trước, rồi mới thử "Thêm vào MH chính"
- [ ] Bản cài ra màn hình chính (standalone): ghi nhận nếu
  - [ ] bị hỏi quyền camera mỗi lần mở (lỗi WebKit đã biết — quyền không được nhớ ở chế độ standalone)
  - [ ] camera đen sau khi kéo Control Center / ra nền → app đã có tự mở lại camera khi quay lại; kiểm tra có hoạt động không
- [ ] Không có nút "Cài app" (iOS không hỗ trợ beforeinstallprompt) → hướng dẫn Chia sẻ → Thêm vào MH chính đã có trong "Hướng dẫn"
- [ ] GPU delegate khởi tạo được (xem debug). Nếu rơi về CPU → ghi model iPhone

## TV / máy chiếu
- [ ] **Cáp HDMI:** điện thoại có xuất hình qua USB-C không (nhiều máy Android tầm trung không có) — ghi model
- [ ] **Phản chiếu:** Smart View / Cast màn hình / AirPlay hiện đủ khung 16:9, có tiếng
- [ ] Mini-game đo độ trễ nhận đủ ≥ 3/6 lần nhảy; ghi số ms đo được theo từng cách nối
- [ ] Sau khi bù độ trễ: nhảy theo hình trên TV thì qua rào, đứng im thì bị đâm
- [ ] **Màn hình phụ Wi-Fi:** `display.html` mở được trên trình duyệt TV (Samsung Tizen / LG webOS / Android TV) và trên laptop Chrome/Edge
  - [ ] Hiện mã 4 số; điện thoại nhập mã → TV có hình trong < 5 s
  - [ ] Bấm OK một lần → có tiếng trên loa TV
  - [ ] Mạng Wi-Fi khách / tách client → báo lỗi rõ ràng (không treo)
  - [ ] Điện thoại khoá màn hình / ra nền → TV báo mất kết nối, điện thoại tạm dừng
  - [ ] **iPhone làm máy phát:** TV nhận hình bình thường (không đen) — canvas.captureStream trên iOS từng có lỗi
- [ ] Điện thoại xoay ngang: camera 16:9, thấy cả bàn chân ở 2,5–3 m
- [ ] Ra khỏi khung > 1 s → TV hiện "Không thấy bạn"; quay lại → đếm ngược rồi chơi tiếp
- [ ] Chơi liên tục 15 phút có cắm sạc: máy có quá nóng / tụt FPS không (ghi lại)

## Giảm rủi ro đã làm sẵn trong code
| Rủi ro | Cách xử lý |
|---|---|
| Thiết bị kén constraint camera | Thử 640×480@30 → lỗi thì `video: true` |
| GPU delegate lỗi | Tự rơi về CPU |
| MediaPipe chậm trên máy yếu | Tự suy luận cách 1 frame khi infer > 45 ms; tự giảm độ phân giải canvas khi FPS < 24 trong 3 s |
| iOS ngắt camera khi ra nền | `ensureCamera()` mở lại khi quay lại / khi bấm Tiếp tục |
| Đổi route làm iOS hỏi lại quyền | App 1 trang, không đổi hash/route |
| Không có camera / bị từ chối | Chế độ vuốt / phím chơi đầy đủ |
| Hình trên TV chậm hơn thực tế | Đo độ trễ + xét va chạm muộn tương ứng, cửa sổ né sớm 250 ms / muộn 120 ms |
| Camera 4:3 bị cắt chân trên khung 16:9 | Chế độ TV xin camera 16:9; tỉ lệ lệch nhiều thì hiện nguyên khung thay vì cắt |
| Wi-Fi yếu | WebRTC ưu tiên giữ khung hình (giảm nét trước), TV phát ngay không đệm |
| Trễ camera → va chạm | Cửa sổ bù trễ 250 ms + One Euro filter (lọc rung nhưng ít trễ) |

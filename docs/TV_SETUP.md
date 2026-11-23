# Chơi trên TV / máy chiếu

**Mô hình:** điện thoại = máy chơi game + camera (giống Kinect) → xử lý nhận diện cơ thể và chạy game. TV / máy chiếu = màn hình lớn. Người chơi đứng trước TV, nhìn chính mình trên màn hình lớn với đường chạy và chướng ngại vật đè lên.

```
   ┌──────────── TV / màn chiếu ────────────┐
   │   người chơi (lật gương) + đường chạy   │
   └────────────────────────────────────────┘
            [📱 điện thoại nằm ngang]   ← camera trước hướng ra phòng
                     ↑ 2,5–3 m
                    🧍 người chơi (khoảng trống rộng ~3 m)
```

## Bố trí
- Điện thoại **nằm ngang**, đặt **ngay dưới (hoặc trên) giữa** TV, **camera trước** hướng về chỗ chơi. Dùng giá đỡ / kẹp, hoặc tựa vào kệ TV.
- Độ cao lý tưởng: ngang hông–ngực người chơi. Đặt thấp quá (sát sàn) thì phải hơi ngửa máy lên.
- Người chơi đứng cách **2,5–3 m**, thấy cả bàn chân trên màn hình. Dọn trống khoảng ~3 m ngang.
- Ánh sáng: sáng đều, tránh đứng ngược sáng (cửa sổ sau lưng).
- **Cắm sạc** cho điện thoại: chạy camera + AI + phát hình liên tục rất tốn pin và làm máy nóng.

## 3 cách đưa hình lên TV
| Cách | Cần gì | Độ trễ hình (ước lượng) | Ghi chú |
|---|---|---|---|
| **Cáp HDMI** | Cáp/hub USB-C → HDMI (Android phải hỗ trợ xuất hình qua USB-C, vd. dòng Galaxy S/Note, nhiều máy cao cấp), hoặc adapter Lightning → HDMI (iPhone đời cũ), USB-C → HDMI (iPhone 15 trở lên) | Thấp nhất | Ổn định nhất. Vào game chọn **Cách 1** |
| **Phản chiếu không dây** | Android: Smart View (TV Samsung), *Truyền màn hình / Cast* (Chromecast, Android TV / Google TV). iPhone: AirPlay → Apple TV hoặc TV hỗ trợ AirPlay | Cao hơn, tuỳ thiết bị | Bật phản chiếu trong cài đặt điện thoại **trước**, rồi vào game chọn **Cách 1** |
| **Màn hình phụ qua Wi-Fi** | TV có trình duyệt (hoặc laptop nối máy chiếu), cùng mạng Wi-Fi với điện thoại | Trung bình | Trên TV mở `https://<địa-chỉ-game>/display.html` → hiện mã 4 số → trên điện thoại chọn **Cách 2**, nhập mã. Tiếng phát ra loa TV |

> Con số độ trễ thật **khác nhau theo từng TV / mạng**, nên game có bước **đo độ trễ** riêng — đừng dựa vào bảng trên.

## Đo & bù độ trễ (tự động lần đầu)
Hình trên TV luôn chậm hơn thực tế một chút. Nếu không bù, bạn sẽ thấy rào "chưa tới" nhưng game đã tính là bị đâm.
1. Lần đầu chơi với một cách nối, sau bước hiệu chỉnh game chạy **mini-game đo độ trễ**: quả bóng rơi xuống vạch 6 lần theo nhịp, bạn **nhảy đúng lúc bóng chạm vạch** (nhìn trên TV).
2. Game lấy trung vị độ lệch → lưu riêng cho từng cách nối (HDMI/phản chiếu và Wi-Fi).
3. Khi chơi, va chạm được xét **muộn hơn đúng bằng độ trễ đó**, cộng cửa sổ chấp nhận: né sớm tới 250 ms hoặc muộn tới 120 ms vẫn tính là qua.
- Đo lại: Cài đặt → **⏱ Đo lại độ trễ ở lượt sau**, hoặc nút **⏱ Đo độ trễ** ở màn hiệu chỉnh. Có thể chỉnh tay bằng thanh trượt 0–600 ms.

## Gợi ý động tác (nhìn / nghe từ xa)
Khoảng 1,3 s trước khi chướng ngại vật tới, viền màn hình đổi màu, hiện mũi tên lớn và có âm báo riêng:
| Màu viền | Biểu tượng | Âm báo | Làm gì |
|---|---|---|---|
| Xanh lơ | ⬆ NHẢY | "vút" lên cao | Nhảy (rào, hố lửa) |
| Tím | ⬇ NGỒI | trượt xuống | Ngồi (laser) |
| Vàng | ⬅ NÉ / NÉ ➡ | bíp bíp | Bước sang làn theo mũi tên |
| Vàng nhạt | 🙌 GIƠ TAY | leng keng | Giơ tay lấy sao |
Tắt âm báo trong Cài đặt nếu muốn chơi "khó".

## Điều khiển không cần chạm
Người chơi đứng xa điện thoại nên mọi thao tác trong lúc chơi đều bằng cơ thể:
- **Giơ 2 tay** (0,7 s) → bắt đầu. Hết lượt: **giơ 2 tay 1,5 s** → chơi lại.
- **Ra khỏi khung hình quá 2 s** → game tự dừng (mất dấu chốc lát < 0,6 s thì game giữ nguyên, không tính). Quay lại → đếm ngược 3-2-1 rồi chơi tiếp.
- Chỉ cần chạm điện thoại khi: chọn chế độ, tạm dừng / về menu.

## Màn hình phụ qua Wi-Fi — chi tiết kỹ thuật
- Điện thoại vẽ **cả hình camera lẫn game vào một canvas 1280×720**, rồi phát canvas đó (kèm tiếng game) sang TV bằng **WebRTC** (`canvas.captureStream`). TV chỉ việc phát video.
- Máy chủ ghép nối **PeerJS cloud miễn phí** chỉ dùng để trao đổi thông tin kết nối qua mã 4 số. Hình và tiếng đi **thẳng trong mạng Wi-Fi nhà bạn**, không qua server.
- Cần Internet lúc ghép nối. Wi-Fi **khách / có "tách client" (AP isolation)** sẽ chặn hai máy thấy nhau → dùng Wi-Fi chính hoặc phát hotspot từ điện thoại.
- Trình duyệt TV chặn tự phát tiếng → bấm OK trên điều khiển TV (hoặc nhấp chuột trên laptop) một lần.
- Góc dưới phải màn hình TV hiện `📡 TV · xx ms` = thời gian khứ hồi mạng giữa điện thoại và TV.

## Sự cố thường gặp
| Triệu chứng | Cách xử lý |
|---|---|
| Chân bị cắt mất trên TV | Lùi xa hơn; điện thoại phải **nằm ngang**; hạ thấp hoặc ngửa máy lên |
| Bước sang trái mà nhân vật chạy sang phải | Đang dùng camera sau → bấm **🔄 Đổi camera** ở màn hiệu chỉnh |
| Bị tính đâm dù đã nhảy kịp | Đo lại độ trễ; hoặc tăng thanh trượt độ trễ thêm 50–100 ms |
| Game "dễ quá", nhảy muộn vẫn qua | Độ trễ đo bị cao → đo lại, nhảy đúng nhịp hơn |
| "Không thấy TV có mã…" | Kiểm tra mã; TV còn mở trang `display.html`; cả hai có Internet |
| Nối được nhưng TV đen / đứng hình | Hai máy không cùng mạng hoặc Wi-Fi tách client → đổi mạng / hotspot |
| Hình trên TV mờ, giật | Wi-Fi yếu → đặt router gần hơn, dùng băng tần 5 GHz, hoặc chuyển sang cáp HDMI |
| iPhone + Wi-Fi: TV nhận hình đen | Lỗi phát canvas qua WebRTC từng có trên iOS → dùng AirPlay hoặc cáp |

# Báo cáo hiệu năng (Giai đoạn 3)

**Trạng thái:** ⏳ **CHƯA ĐỦ DỮ LIỆU ĐỂ KẾT LUẬN ĐẠT/KHÔNG ĐẠT** — công cụ đo đã nằm sẵn trong app; cần chạy trên máy thật theo quy trình dưới đây rồi điền vào bảng. Không có số đo thật thì không ký duyệt.

## 1. Mục tiêu (ngưỡng ĐẠT)
| Chỉ số | Mục tiêu | Vì sao |
|---|---|---|
| FPS vẽ p50 | ≥ 30 (lý tưởng 60) | Đường chạy mượt |
| FPS vẽ p5 (khung tệ nhất) | ≥ 24 | Không giật khi nhiều lửa/hạt |
| Thời gian suy luận pose p95 | ≤ 40 ms | Giữ ≥ 25 lần nhận diện/giây |
| Trễ camera → kết quả pose p95 | ≤ 100 ms | Cộng với cửa sổ bù 250 ms vẫn công bằng |
| Tỉ lệ mất người (personLostRatio) | ≤ 5% | Đứng đúng 2 m mà vẫn mất người = nhận diện tệ |
| Tải lần đầu (4G) | < 10 s tới màn hiệu chỉnh | ~20 MB MediaPipe |
| Độ trễ màn hình đo được (chế độ TV) | ≤ 250 ms | Đã bù, nhưng trễ lớn làm game "lỏng" |
| Wi-Fi: khung hình nhận trên TV | ≥ 25 fps, ≥ 960×540 | Đọc từ `chrome://webrtc-internals` trên TV/laptop |
| Wi-Fi: RTT điện thoại ↔ TV | ≤ 30 ms | Góc dưới phải màn hình TV |
| Đánh giá người chơi 👎 | < 10% lượt | Định nghĩa "hỏng" trong GDD |

## 2. Cách đo (mỗi máy ~3 phút)
1. Mở `https://<site>/?debug=1` trên máy cần đo, sạc pin > 50%, tắt chế độ tiết kiệm pin.
2. Chơi bằng camera 1 lượt đầy đủ (≥ 90 s) ở ~2 m, ánh sáng phòng bình thường.
3. Cài đặt → **📊 Xuất báo cáo hiệu năng (JSON)** → file `aor-perf-*.json` tải về (đồng thời được copy vào clipboard).
4. Lặp lại với model **Full** để so sánh.
5. Gom các file JSON, điền bảng mục 4.

File JSON có: thông tin máy (UA, số nhân CPU, RAM nếu trình duyệt cho biết), delegate GPU/CPU, độ phân giải camera, p50/p95/max của khung vẽ, suy luận, trễ camera→pose, lịch sử 30 lượt chơi và phản hồi 👍/😐/👎.

> Trễ camera→pose đo bằng `requestVideoFrameCallback().captureTime` (Chrome Android có; Safari có thể trả `n/a` → khi đó chỉ có thời gian suy luận).

## 3. Baseline đã có (sandbox — CHỈ để kiểm tra công cụ đo)
Chrome headless trên server, **GPU giả lập bằng CPU (SwiftShader)**, camera giả 480×480, model lite, delegate GPU:

| Chỉ số | Giá trị | Ghi chú |
|---|---|---|
| Suy luận pose p50 / p95 | 399 / 506 ms | Chậm vì không có GPU thật |
| Trễ camera→pose p50 / p95 | 425 / 509 ms | |
| Tỉ lệ mất người | 1% | Video nhân vật 3D, ánh sáng đều |
| Tự bật "suy luận cách frame" | Có | Logic thích nghi hoạt động đúng |

Những số này **không đại diện cho điện thoại**. Trên điện thoại có GPU thật, MediaPipe Pose lite thường nhanh hơn nhiều — nhưng phải đo mới biết.

### Sandbox — màn hình phụ Wi-Fi (2 trình duyệt headless, máy chủ PeerJS chạy local)
| Chỉ số | Giá trị | Ghi chú |
|---|---|---|
| Thời gian từ bấm "Kết nối" tới TV có hình | 0,5–0,7 s | |
| Track nhận trên TV | audio + video | Tiếng game đi theo stream |
| Khung hình nhận | 2–3 fps, 480×270 | Do CPU sandbox bị MediaPipe (GPU giả lập) chiếm hết → bộ mã hoá tự hạ chất lượng. Không đại diện cho điện thoại có bộ mã hoá phần cứng |
| Mini-game đo độ trễ | Giả lập nhảy muộn 150 ms → đo được 153 ms | Logic đo chính xác |

## 4. Kết quả thiết bị thật (điền sau khi đo)
| Máy | OS / Trình duyệt | Cách xuất hình | Model | Delegate | FPS p50 / p5 | Suy luận p95 | Cam→pose p95 | Độ trễ TV đo được | ĐẠT? |
|---|---|---|---|---|---|---|---|---|---|
| (Android tầm trung) | | Wi-Fi | lite | | | | | | |
| (Android tầm trung) | | phản chiếu | lite | | | | | | |
| (Android có xuất HDMI) | | HDMI | lite | | | | | | |
| (iPhone) | | AirPlay | lite | | | | | | |

## 5. Danh sách tối ưu theo ưu tiên
**Đã làm sẵn**
- Model **lite** mặc định, GPU delegate, tự rơi về CPU.
- Camera 640×480@30 (không xin 1080p — pose không cần, đỡ băng thông bộ nhớ).
- Chỉ suy luận khi có frame camera mới (không suy luận trùng frame ở 60 Hz).
- Tự suy luận cách 1 frame khi infer > 45 ms; tự giảm độ phân giải canvas (×0.75) khi FPS < 24 trong 3 s; DPR tối đa 2.
- Video camera là thẻ `<video>` riêng (GPU compositor lật gương bằng CSS) — không vẽ lại video vào canvas mỗi frame.
- Không dùng `shadowBlur` (đắt trên mobile); HUD là DOM chỉ cập nhật khi đổi số.
- Service worker cache wasm + model → lần 2 vào gần như tức thì.

**Ưu tiên cao (làm nếu số đo trượt)**
- *Kiểu Khung cảnh game tốn thêm:* mặt nạ tách người (đọc ~640×360 số thực/khung) + cắt ảnh người bằng JS. Sandbox đo: chép mặt nạ ~4–16 ms tuỳ cỡ ảnh vào. Nếu máy chậm: chuyển sang "Thấy phòng thật" (tắt tách nền), hoặc hạ khung nhận diện từ 640 xuống 480 px (`pose.js`).
0. *Chế độ Wi-Fi tốn thêm CPU/GPU điện thoại* (vẽ camera vào canvas + mã hoá video): nếu FPS < 30 thì hạ canvas xuống 960×540 (`CONFIG.TV`) hoặc `streamFps` 24.
1. *Suy luận p95 > 40 ms trên Android tầm trung:* chuyển suy luận sang **Web Worker + OffscreenCanvas/ImageBitmap** để không chặn vòng vẽ. Đổi lại: trễ +1 frame. Ước tính: FPS vẽ ổn định 60 bất kể pose chậm.
2. *Trễ cam→pose cao:* hạ camera xuống 480×360; thêm **dự đoán tuyến tính** vị trí hông 1 frame tới để bù trễ.
3. *Nhảy bị "nuốt" ở pose < 15 Hz:* hạ `jumpEnter` hoặc tăng `forgiveMs` (đã có thanh trượt độ nhạy trong Cài đặt).

**Ưu tiên trung bình**
4. Vẽ sẵn sprite lửa vào canvas phụ (pre-render) thay vì gradient mỗi frame khi có > 4 hố lửa.
5. Giới hạn hạt (particles) theo mức chất lượng (hiện tối đa 220).

**Dài hạn / giám sát**
6. Gom JSON từ người chơi thật (form miễn phí) → theo dõi p95 theo dòng máy.
7. Thêm "bài test tự động 20 s" khi mở app lần đầu để tự chọn lite/full.

## 6. Ký duyệt
- Ngày phân tích: 23/11/2026 · Trạng thái: **CHƯA ĐO TRÊN MÁY THẬT** · Sẵn sàng mở rộng: Cần đo thêm

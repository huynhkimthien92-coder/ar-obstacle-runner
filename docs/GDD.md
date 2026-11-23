# GDD ngắn — AR Obstacle Runner  (v0.1 · 23/11/2026)

> Mọi con số đánh dấu **(PH)** là placeholder, chỉ chốt sau playtest. Bảng tuning thật nằm ở `js/config.js`.

## 1. Tầm nhìn
Endless-runner mà **tay cầm là chính cơ thể**, chơi như máy console trong phòng khách: **điện thoại là máy chơi + camera** (giống Kinect) đặt nằm ngang dưới TV, **TV / máy chiếu là màn hình**. Đường chạy và chướng ngại vật vẽ đè lên hình camera, nên người chơi thấy chính mình cỡ người thật trên màn hình lớn, "đứng" trên đường chạy giữa phòng nhà mình. Chơi trên màn hình điện thoại vẫn được (để thử nhanh). Cách bố trí: `docs/TV_SETUP.md`.

**Player fantasy:** "Tôi đang né bẫy như trong game show thể thao" — vận động thật, đổ mồ hôi thật, buồn cười khi bị "rơi hố lửa".

## 2. Core loop (3 tầng)
| Tầng | Thời lượng | Mục tiêu | Phản hồi / phần thưởng | Móc giữ chân |
|---|---|---|---|---|
| Moment-to-moment | 0–30 s | Đọc chướng ngại đang tới → bước / nhảy / ngồi / giơ tay đúng lúc | Âm "ting", chữ "Nhảy chuẩn!", combo ×2…×5, rung (Android) | Combo tăng điểm, sao +50 |
| Session | 2–6 phút (PH) | Đi xa nhất trước khi hết 3 mạng | Điểm = mét + xu + sao + né × combo; tốc độ tăng dần | Kỷ lục mới 🏆, giơ 2 tay để chơi lại ngay |
| Long-term | Ngày–tuần | Phá kỷ lục, chơi như bài tập | Kỷ lục lưu trên máy | (v2) thử thách hằng ngày, bảng xếp hạng bạn bè |

Thời lượng phiên ngắn là cố ý: vận động toàn thân mệt nhanh hơn nhiều so với game chạm ngón tay.

## 3. Đặc tả cơ chế

### 3.1 Đổi làn (bước ngang)
- **Mục đích:** động tác dễ nhất, dạy đầu tiên. **Input:** tâm hông theo bề ngang màn hình; màn hình chia 3 phần = 3 làn.
- **Output:** làn 0/1/2. **Trễ (hysteresis):** 4% bề ngang (PH) để không rung giữa 2 làn.
- **Thành công:** đứng ngoài làn có tường/hố lửa lúc nó chạm vạch người chơi. **Thất bại:** đứng trong làn đó → mất 1 mạng.
- **Edge case:** người ra khỏi khung > 1 s → tạm dừng, hiện "Không thấy bạn". Phòng hẹp → camera quay ngang rộng hơn / lùi xa hơn.
- **Tuning lever:** `laneHyst`. **Phụ thuộc:** pose ổn định ở 2 vai + 2 hông.

### 3.2 Nhảy
- **Input:** hông nâng lên ≥ 16% chiều dài thân (PH) so với baseline lúc hiệu chỉnh; hết nhảy khi < 8%.
- **Dùng cho:** rào thấp (bắt buộc), hố lửa cả 3 làn (bắt buộc), hố lửa 1 làn (một trong hai cách).
- **Bù trễ:** nhảy trong 250 ms (PH) *trước* thời điểm chạm vẫn tính — vì camera→pose trễ ~50–120 ms và người đáp đất nhanh.
- **Edge case:** "nhảy" kéo dài > 1.2 s là bất khả thi → hiểu là baseline trôi (người tiến lại gần camera), tự hiệu chỉnh lại.

### 3.3 Ngồi xuống
- **Input:** vai hạ ≥ 22% thân (PH); hết khi < 12%. Không thể vừa nhảy vừa ngồi.
- **Dùng cho:** laser ngang (cao ~1.25 m trong thế giới game).
- **Edge case:** ngồi > 3.5 s → hiệu chỉnh lại (tránh kẹt trạng thái).

### 3.4 Giơ tay hái sao
- **Input:** cổ tay cao hơn mũi. 2 tay = bắt đầu / chơi lại (giữ 0.7 s / 1.5 s) để không phải chạy lại chạm màn hình.
- **Dùng cho:** ngôi sao lơ lửng trên đầu (+50 × combo). Không bắt buộc — thưởng cho người chủ động.

### 3.5 Bù độ trễ màn hình (TV / máy chiếu)
- **Mục đích:** người chơi phản ứng theo hình *trên TV*, mà hình này chậm hơn thực tế (cáp HDMI ít, phản chiếu không dây nhiều).
- **Input:** mini-game 6 nhịp bóng rơi, người chơi nhảy đúng lúc bóng chạm vạch → trung vị độ lệch = độ trễ L (0–600 ms), lưu riêng cho từng cách nối.
- **Output:** va chạm xét ở mặt phẳng `z = −tốc độ × L` thay vì z = 0. Cửa sổ chấp nhận: né sớm ≤ 250 ms, muộn ≤ 120 ms (PH).
- **Edge case:** đo được < 3 nhịp → dùng mặc định (PH: HDMI/phản chiếu 220 ms, Wi-Fi 200 ms). Đo quá cao → game dễ hơn thực tế; có thanh trượt chỉnh tay.

### 3.6 Mạng, bất tử, tốc độ
- 3 mạng (PH). Bị đâm → bất tử 1.5 s (PH), combo về ×1, tốc độ lùi lại ~6 s ramp để người chơi hồi.
- Tốc độ 7 → 15 m/s (PH), +0.045 m/s mỗi giây (PH). Không tăng tốc trong phần hướng dẫn.

## 3b. Game thứ hai — "Ô an toàn" (1–4 người)
- **Player fantasy:** trò chơi tập thể kiểu game show — cả nhà nhảy loạn xạ tìm chỗ đứng an toàn giữa sàn lửa.
- **Cơ chế:** phần sàn trước camera chia lưới ô (thấy được chân: 3 hàng × 3–4 cột, đi tiến/lùi/ngang; chỉ thấy nửa người: 1 dải ô ngang). Mỗi vòng: xáo ô (0,9 s) → hiện ô xanh/đỏ, đếm ngược → hết giờ ai có điểm chân trên ô đỏ (hố lửa) hoặc không có trong khung thì mất 1 mạng → hiện kết quả (1,8 s) → vòng mới.
- **Vì sao vẽ lưới theo hình camera được:** camera đứng yên nên mỗi điểm trên sàn luôn ở đúng một chỗ trên hình. Điểm chân trên màn hình chính là vị trí trên sàn → lưới vẽ đè lên sàn khớp với sàn thật, không cần đo phòng.
- **Độ khó (PH):** thời gian 5 s → tối thiểu 2 s (−0,25 s/vòng); ô đỏ 34% → tối đa 80% (+5%/vòng); từ vòng 6 ô đổi màu 1 lần giữa chừng. Ô đang có người đứng có 80% khả năng hoá đỏ để buộc di chuyển. Luôn còn ít nhất 1 ô xanh cho mỗi người còn sống.
- **Mạng:** 1 người = 3 mạng, điểm = số vòng sống sót (có kỷ lục). Nhiều người = 2 mạng/người, hết mạng bị loại, người cuối cùng thắng.
- **Nhiều người:** MediaPipe nhận tối đa 4 bộ khung xương; game tự gán ID theo vị trí gần nhất giữa các khung hình. Người đã vào ván mà khuất tối đa 15 s rồi quay lại vẫn giữ đúng P1/P2. Ai có mặt lúc đếm ngược kết thúc mới được tính vào ván.
- **Edge case:** 2 người đứng sát / che nhau → có thể bị đổi ID; không thấy ai lúc bắt đầu → chờ. Có bù độ trễ màn hình khi chốt kết quả.

## 3c. Game thứ ba — "Chém trái cây" (1–2 người)
- **Player fantasy:** kiếm sĩ chém trái cây giữa trời đêm — vung tay thật, thấy lưỡi chém vệt sáng và trái bổ đôi bắn nước.
- **Bố cục:** người được tách nền, **thu nhỏ còn 30% chiều cao màn hình** đứng ở đáy; trời chiếm ~85% màn hình nên trái rơi từ rất cao, có nhiều thời gian phản ứng.
- **Lưỡi chém = vai + hướng vươn tay × tầm màn hình** (không phải vị trí tay thật trong hình): hướng vươn tính theo chiều dài cánh tay của chính người chơi (đo liên tục, lấy lớn nhất). Tay cao hơn đầu một chút (≈60% chiều dài tay) đã chạm đỉnh; dang hết tay chạm mép. Vì vậy **không cần với cao → tay không ra khỏi khung camera → không mất dấu tay**. Cổ tay khuất thì đoán theo hướng cánh tay từ khuỷu. Có dây mờ nối cổ tay thật (nhỏ) với lưỡi chém để dễ hiểu.
- **Chém:** đoạn đường lưỡi chém đi qua trong 1 khung cắt ngang trái (nới vùng trúng 1,2% chiều cao) **và** tay nhanh hơn 0,7 × chiều cao màn hình/giây (để tay để yên không chém bừa).
- **Vật thể:** dưa hấu, cam, táo, xoài (1 điểm), thanh long (2 điểm), **bom** (viền đỏ nhấp nháy, chém trúng mất 1 ♥, 3 lần hết lượt), **khế vàng** (+5 giây, +5 điểm). Trái rơi chạm đáy chỉ mất, không trừ mạng (chơi bằng người thật nên chỉ phạt bom).
- **Combo:** một tay chém ≥3 trái trong 0,3 s = 1 nhát → thưởng thêm bằng số trái.
- **Độ khó (PH):** 75 s/lượt; nhịp rơi 1,35 s → 0,55 s; 1 → 3 trái mỗi đợt; trọng lực 0,30 → 0,62 × H/s² (lúc đầu ~2 s từ đỉnh xuống đáy); bom xuất hiện từ giây thứ 8, tỉ lệ 5% → 18%.
- **Lưỡi chém (v0.8):** vệt sáng thon — đuôi nhọn, thân dày theo tốc độ vung, đầu bo; nội suy Catmull-Rom (điểm tay từ camera thưa); dài tối đa 30% chiều cao, giữ 0,22 s đường tay gần nhất; tay đứng yên chỉ còn vòng rỗng mờ.
- **2 người đối kháng (v0.8):** có 2 người trong khung lúc bắt đầu → tự vào chế độ 2 người (chọn 2 người vai rộng nhất = gần camera nhất, xếp trái → phải thành P1 xanh / P2 cam, giữ ID 15 s khi khuất). Mỗi người một hình nhỏ ở đáy theo chỗ đứng thật (cách nhau ≥ 30% màn hình), nhãn P1/P2 trên đầu, 2 lưỡi chém mỗi người. Chung bầu trời, chung đồng hồ; **điểm riêng**, ai nhiều hơn thắng. Bom: −5 điểm + choáng 1,2 s (lưỡi xám, không chém được) thay vì mất mạng. Nhiều trái hơn (+1 mỗi đợt, tối đa 12 trên trời); tầm ngang lưỡi chém 0,55 W (1 người: 0,65 W).

## 3d. Game thứ tư — "Đấu khủng long" (1 người)
- **Player fantasy:** đứng mặt đối mặt với khủng long — nó nhìn thẳng vào bạn, gầm, lao tới; bạn né, cúi, đỡ rồi phản đòn.
- **Góc nhìn thứ nhất:** khủng long đi từ chân trời tới (to dần), **quay mặt thẳng vào màn hình** (vẽ chính diện bằng Canvas 2D thuần, không cần ảnh). Người chơi chính là "camera"; khung nhỏ **BẠN** góc trái dưới hiện người thật (đã tách nền) để biết mình đang né / ngồi / đỡ.
- **Đánh:** điểm yếu đỏ sáng lần lượt hiện trên người khủng long (đầu, ngực, vai…, sống 1,7 s); vung tay nhanh (> 0,8 × H/s) qua điểm yếu = −1 máu. Tay ánh xạ giống Chém trái cây (theo hướng vươn tay so với vai) nên không cần với ra khỏi khung camera.
- **Bị tấn công (báo trước 1,15–1,35 s: khủng long đỏ rực, gồng, mắt đỏ, chữ hướng dẫn to + âm báo):**
  | Đòn | Loài | Phản ứng |
  |---|---|---|
  | Cắn / Húc | Raptor, T-Rex / Ba sừng | **NÉ** sang hướng mũi tên (bước hoặc nghiêng người ≥ 9% bề ngang khung so với chỗ đứng gốc) |
  | Vồ / Hất sừng / Lao xuống / Quật đuôi | Raptor / Ba sừng / Thằn lằn bay / T-Rex | **NGỒI** |
  | Gầm (sóng âm) | T-Rex | **GIƠ 2 TAY** đỡ |
  | Ném đá | Thằn lằn bay | **ĐẬP** 3 tảng đá bay tới bằng tay |
  Cửa sổ chấp nhận: sớm 0,35 s, muộn 0,12 s **sau khi đã bù độ trễ màn hình** (đo ở bài đo độ trễ). Chỗ đứng gốc trôi chậm theo người chơi khi không bị tấn công → không phải đứng đúng giữa khung.
- **Động tác (v1.1):** khủng long có khớp nối — chân bước luân phiên (T-Rex / Ba sừng dậm rung màn hình, tung bụi), thân nhún, đầu / hàm / tay / đuôi / cánh cử động riêng. Mỗi đòn 3 nhịp: **lấy đà** (ngả đầu ra sau & sang phía ngược lại, run bần bật, cào đất, nhún rình, bay vọt lên, ngửa cổ hít hơi, xoay người…) → **ra đòn** bắt đầu trước lúc chốt 0,22 s để hình *chạm* đúng lúc tính né/đỡ (đầu phóng to lao sang ngang mặt rồi ĐỚP khép hàm, chồm vồ kèm vết móng cào, lao cả thân húc, hất sừng, cụp cánh bổ nhào, gầm sóng âm, quật đuôi quét ngang) → **thu về**. Trúng đòn thì giật đầu, nheo mắt; choáng thì lảo đảo; gục thì khuỵu chân đổ nghiêng.
- **Phản công:** né / đỡ đúng → khủng long choáng 1,3 s, hiện **điểm yếu vàng ×2** to.
- **Tiến trình:** Raptor (6 máu) → Ba sừng (9) → Thằn lằn bay (7) → T-Rex trùm (14); hết 4 con sang vòng mới: máu +40%, gồng / nghỉ nhanh ×0,88. 5 mạng, bất tử 1 s sau khi trúng đòn. Mất dấu người > 0,8 s → khủng long đứng chờ.
- **Điểm:** trúng 10 × sát thương, né / đỡ 5, đập đá 5 — nhân chuỗi ×1 → ×4 (mỗi 5 lần đúng liên tiếp +1); hạ gục +50 × vòng (trùm ×2).

## 4. Bảng kinh tế điểm (tuning)
| Biến | Gốc | Min | Max | Lý do |
|---|---|---|---|---|
| Điểm mỗi mét | 1 | – | – | Thưởng sống sót, dễ hiểu |
| Xu | 10 × combo | 5 | 20 | Dụ người chơi đổi làn sớm (dạy đọc đường) |
| Sao | 50 × combo | 30 | 100 | Động tác tốn sức nhất + rủi ro đứng sai làn |
| Né chướng ngại | 5 × combo | 0 | 10 | Thưởng kỹ năng, không chỉ đứng yên may mắn |
| Combo | +1 bậc mỗi 4 lần né, max ×5 | ×3 | ×8 | Tạo căng thẳng "đừng để mất chuỗi" |
| Khoảng cách tối thiểu giữa 2 động tác bắt buộc | 1.2 s | 1.0 s | 1.6 s | Người cần thời gian tiếp đất / đứng dậy |

## 5. Onboarding (checklist)
- [x] Động tác chính (bước) xuất hiện đầu tiên, có dải xu dẫn đường → **thành công đầu tiên gần như chắc chắn**.
- [x] Mỗi động tác mới xuất hiện **một mình** với chữ nhắc lớn (Bước / Nhảy / Ngồi / Hố lửa / Giơ tay).
- [x] Không tăng tốc trong hướng dẫn; khoảng cách giữa các chunk hướng dẫn dài hơn 40%.
- [x] Hướng dẫn chỉ chạy lần đầu (bật lại trong Cài đặt).
- [x] Kết phiên có móc: điểm, kỷ lục, "giơ 2 tay để chơi lại".

## 6. "Hỏng" trông như thế nào (định nghĩa trước khi playtest)
- Người chơi bị tính "đâm" dù chắc chắn đã nhảy (kể cả khi chơi trên TV, sau khi đã đo độ trễ) → tỉ lệ khiếu nại > 1/10 lượt = **hỏng** (nút 👍/😐/👎 sau mỗi lượt đo việc này).
- Nhảy giả khi đang bước ngang / thở mạnh → xuất hiện > 1 lần/phút = **hỏng**.
- Người chơi không hiểu phải làm gì ở chướng ngại đầu tiên = **hỏng** onboarding.
- FPS < 24 kéo dài hoặc trễ camera→pose p95 > 150 ms = **hỏng** cảm giác (xem PERFORMANCE.md).

## Changelog
- v0.1 (23/11/2026): bản đầu, 5 loại chướng ngại + sao, 3 tier, tutorial 6 bước.
- v1.1 (23/11/2026): Đấu khủng long — khủng long có động tác thật (bước đi, lấy đà, ra đòn, thu về) thay vì phóng to hình tĩnh.
- v1.0 (23/11/2026): game thứ tư **Đấu khủng long** (góc nhìn thứ nhất, 4 loài vẽ chính diện, né / ngồi / đỡ / đập đá, phản công ×2).
- v0.9.1 (23/11/2026): Ô an toàn — 2 người đứng sát nhau: ghép người theo vị trí dự đoán + màu áo, gán tối ưu cả nhóm, bỏ khung xương trùng, bỏ chân "lạc" sang người bên cạnh, lọc trung vị vị trí chân; chốt ô theo ô đứng nhiều nhất 0,35 s cuối, bị che lúc chốt thì dùng ô thấy gần nhất (≤ 1,5 s).
- v0.9 (23/11/2026): lọc "người giả" cho cả 3 game — khung xương phải giống người (rõ mặt + vai, đầu trên vai, tỉ lệ thân/tay hợp lý, nằm trong mặt nạ người) và phải xuất hiện liên tục ≥ 0,45 s, không rung loạn, mới tính là có người (js/personcheck.js). Ngưỡng phát hiện người mới 0,4 → 0,5.
- v0.8 (23/11/2026): Chém trái cây — lưỡi chém vệt sáng; chế độ 2 người đối kháng.
- v0.7 (23/11/2026): game thứ ba **Chém trái cây** (người thu nhỏ ở đáy, trời cao, lưỡi chém theo hướng vươn tay so với vai).
- v0.6 (23/11/2026): kiểu hiển thị **Khung cảnh game** (mặc định): tách người khỏi nền bằng mặt nạ segmentation của MediaPipe, thu nhỏ theo **Cỡ người** (mặc định 42% chiều cao màn hình), đặt chân lên đường đua / lưới ô ảo; nền phòng thay bằng khung cảnh game → đồ hoạ không còn bị môi trường làm mờ, không cần lùi xa trong phòng chật. Kiểu **Thấy phòng thật** có thanh làm tối nền. Màn chỉnh góc / hiệu chỉnh vẫn hiện phòng thật.
- v0.5 (23/11/2026): màn **Chỉnh góc camera** (không tự vào game) với bảng kiểm tra trực tiếp, làn/mặt sàn/lưới ô xem trước, thước thăng bằng; sửa lỗi mất hình camera lúc chơi trên Chrome Android (canvas tự vẽ hình camera).
- v0.4 (23/11/2026): (1) **nhận diện lại** khi quay vào khung: không so với tư thế cũ mà lấy lại baseline trong 0,4 s (trước đây quay lại ở chỗ khác bị báo nhảy/ngồi nhầm); bộ đếm tạm dừng dùng đồng hồ thật. (2) **Tỉ lệ người – đường đua:** mặt đường đặt đúng ở chân người chơi, 1 m tính theo chiều cao thật của người đó → rào ngang gối, laser ngang ngực, tường cao hơn đầu (trẻ em thấp thì mọi thứ thấp theo). (3) **Game mới "Ô an toàn"** 1–4 người.
- v0.3 (23/11/2026): playtest đầu tiên báo "chơi trên điện thoại phải đứng xa, không nhìn thấy, dễ mất dấu" → thêm **khung nửa người** cho màn hình điện thoại (đứng 1–1,5 m, chỉ cần đầu→hông), chỉ bắt buộc thấy 2 vai (hông suy ra từ vai), giữ trạng thái khi mất dấu < 0,6 s, chỉ tạm dừng sau 2 s mất người, hạ ngưỡng tin cậy MediaPipe xuống 0,4, camera 960×540, **gợi ý động tác nhìn/nghe được từ xa** (viền màn hình đổi màu + mũi tên lớn + âm báo riêng từng động tác).
- v0.2 (23/11/2026): chuyển trọng tâm sang **điện thoại + TV/máy chiếu**: chế độ TV 16:9, 2 cách xuất hình (HDMI/phản chiếu, màn hình phụ Wi-Fi), đo & bù độ trễ, tự dừng/tiếp tục khi ra khỏi khung, thêm cửa sổ né muộn 120 ms.

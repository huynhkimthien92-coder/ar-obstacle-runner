# Bản đồ chướng ngại vật

Nguồn thật: `js/levels.js`. Game không có màn cố định — đường chạy được ghép từ các **chunk** (đoạn ngắn), chọn ngẫu nhiên theo tier đã mở khoá. Thời gian tính bằng **giây** rồi đổi sang mét theo tốc độ lúc sinh ra, nên thời gian phản xạ giữ nguyên khi game nhanh dần.

**Ký hiệu làn:** `P` = làn người chơi đang đứng lúc chunk được sinh · `X`, `Y` = hai làn còn lại · `A` = cả 3 làn

## Loại chướng ngại
| Ký hiệu | Tên | Cách vượt | Hình |
|---|---|---|---|
| 🧱 WALL | Tường | Bước sang làn khác | Khối xanh viền vàng, cao 2 m |
| 🔥 FIRE | Hố lửa | 1 làn: nhảy **hoặc** né · cả 3 làn: **phải nhảy** | Hố đỏ cam, lưỡi lửa nhảy múa |
| 🚧 HURDLE | Rào thấp | Nhảy | Thanh sọc đỏ trắng cao 0.45 m |
| 🔴 BAR | Laser | Ngồi xuống | Tia đỏ cao 1.25 m |
| 🪙 COIN | Xu | Đứng đúng làn | Đồng vàng xoay |
| ⭐ STAR | Sao | Đứng đúng làn + giơ tay | Sao vàng trên cao, có vạch chỉ xuống |

## Tier 0 — Hướng dẫn (chạy theo thứ tự)
| Chunk | Nội dung (t giây) | Dạy |
|---|---|---|
| tut-coins | 5 xu ở làn P | Xu = đứng yên cũng được, cảm giác thắng đầu tiên |
| tut-move | 4 xu làn X (0–0.7s) → tường làn P (1.0s) | Bước ngang, xu dẫn đường |
| tut-jump | rào cả 3 làn | Nhảy |
| tut-duck | laser cả 3 làn | Ngồi |
| tut-fire | hố lửa làn P + 3 xu làn X | Hai cách vượt hố lửa |
| tut-star | sao làn P | Giơ tay |

## Tier 1 — mở từ 0 m
| Chunk | Nội dung |
|---|---|
| coin-line | 6 xu làn P |
| wall-single | 4 xu X, tường P ở 0.6s |
| hurdle | rào A |
| bar | laser A |
| fire-single | hố lửa P + 3 xu X |
| star-single | sao làn X (phải bước + giơ tay) |

## Tier 2 — mở từ 250 m (PH)
| Chunk | Nội dung | Lời giải |
|---|---|---|
| fire-two | lửa P + lửa Y, xu X | Sang X hoặc nhảy |
| wall-hurdle | tường P (0s) → rào A (1.3s) | Bước rồi nhảy |
| hurdle-bar | rào A (0s) → laser A (1.4s) | Nhảy rồi ngồi |
| zigzag | tường P+Y (0s) → tường X+P (1.6s), xu Y | X rồi Y |
| fire-all | lửa cả 3 làn | Bắt buộc nhảy |
| bar-star | laser A (0s) → sao P (1.5s) | Ngồi rồi bật lên giơ tay |

## Tier 3 — mở từ 700 m (PH)
| Chunk | Nội dung | Lời giải |
|---|---|---|
| gauntlet | rào → laser → lửa A (mỗi 1.25s) | Nhảy, ngồi, nhảy |
| fire-walls | tường P + lửa X (0s) → lửa Y + tường X (1.5s) | Y (hoặc nhảy ở X) rồi P |
| duck-jump-duck | laser → rào → laser (mỗi 1.25s) | Ngồi, nhảy, ngồi |
| star-rush | sao P, X, Y (mỗi 1.2s) | Nghỉ thở + điểm thưởng |
| lava-run | lửa P+X (0s) → lửa A (1.3s), xu Y | Sang Y rồi nhảy |

Chọn tier: 60% tier cao nhất đã mở, 40% ngẫu nhiên các tier thấp hơn (xen đoạn dễ để người chơi thở). Không lặp lại cùng chunk 2 lần liền.

## Bảo đảm chơi được
`tests/game.test.mjs` có một bot chơi 4 phút trên 20 seed: **0 lần bị đâm** → mọi chunk đều có lời giải. Test khác kiểm tra mọi chunk giữ khoảng cách ≥ 1.2 s giữa 2 động tác bắt buộc.

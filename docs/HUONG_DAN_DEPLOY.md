# Hướng dẫn đưa game lên mạng (miễn phí, chỉ cần trình duyệt)

Camera trên điện thoại **chỉ bật được qua HTTPS**, nên phải đưa lên host. Cả 2 cách dưới đây đều miễn phí, không cần thẻ, không cần CLI / terminal.

## Cách A — GitHub Pages (khuyên dùng, chỉ thao tác trên web GitHub)
1. Vào github.com → **New repository** → tên `ar-obstacle-runner` → chọn **Public** → Create.
2. Trong repo mới: **Add file → Upload files** → giải nén file zip, kéo **toàn bộ nội dung bên trong thư mục** `ar-obstacle-runner/` (gồm `index.html`, `sw.js`, `manifest.webmanifest`, các thư mục `js/`, `css/`, `icons/`, `docs/`, `tests/`) vào ô upload → **Commit changes**.
   - `index.html` phải nằm ở **gốc repo**, không nằm trong thư mục con.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
4. Đợi 1–3 phút, link có dạng `https://<tên-github>.github.io/ar-obstacle-runner/`.
5. Mở link trên điện thoại → **📺 Chơi trên TV / máy chiếu** (cách bố trí: `docs/TV_SETUP.md`).
6. Màn hình phụ qua Wi-Fi: trên TV/laptop mở cùng link nhưng thêm `display.html` ở cuối, vd. `https://<tên-github>.github.io/ar-obstacle-runner/display.html`.

## Cách B — Vercel (nếu đã dùng Vercel cho dự án khác)
1. Làm bước 1–2 của cách A để có repo.
2. vercel.com → **Add New → Project** → Import repo → Framework Preset: **Other** → để trống Build Command và Output Directory → Deploy.

## Cập nhật bản mới
1. Upload đè file đã sửa lên repo (Add file → Upload files).
2. **Quan trọng:** mở `sw.js`, tăng `VERSION` (vd. `aor-v1.0.0` → `aor-v1.0.1`) rồi commit. Nếu không, người đã chơi sẽ vẫn thấy bản cũ trong cache.

## Chạy thử trên máy tính (nếu có Python/Node)
- `python -m http.server 8080` trong thư mục game → mở `http://localhost:8080` (localhost được phép dùng camera).
- Chạy test logic: `node --test tests/*.test.mjs` (Node 18+).

## Lỗi thường gặp
| Triệu chứng | Nguyên nhân / cách sửa |
|---|---|
| "Camera chỉ chạy trên HTTPS" | Đang mở file trực tiếp hoặc http:// → dùng link GitHub Pages |
| Trang trắng, 404 | `index.html` không ở gốc repo |
| "Không tải được bộ nhận diện" | Lần đầu cần mạng; mạng công ty có thể chặn `cdn.jsdelivr.net` / `storage.googleapis.com` → thử 4G, hoặc tự host (FREE_TIER_LIMITS.md) |
| iPhone hỏi quyền camera mỗi lần mở từ màn hình chính | Lỗi đã biết của iOS ở chế độ cài app → chơi trong tab Safari, hoặc chấp nhận bấm Cho phép |
| Sửa code mà điện thoại vẫn bản cũ | Chưa tăng `VERSION` trong `sw.js`; hoặc đóng hẳn tab rồi mở lại |

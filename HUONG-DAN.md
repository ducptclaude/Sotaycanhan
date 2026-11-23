# Sổ Cá Nhân – Ứng dụng PWA chạy cả khi không có mạng

## Trong thư mục
| Tệp | Vai trò |
|---|---|
| `index.html` | Toàn bộ ứng dụng |
| `manifest.webmanifest` | Thông tin để cài lên màn hình chính (tên, biểu tượng, màu) |
| `sw.js` | Service Worker: lưu giao diện, biểu tượng, phông chữ để mở khi mất mạng |
| `icons/` | Biểu tượng cho Android, iPhone, trình duyệt |
| `_headers` | Cấu hình bộ nhớ đệm cho Netlify / Cloudflare Pages |
| `server/` | Máy chủ đồng bộ mẫu (tuỳ chọn) |
| `kiem-tra/` | Kết quả kiểm tra ngắt mạng thực tế + ảnh chụp |

## 1. Đưa lên mạng (bắt buộc có HTTPS)
PWA chỉ cài và chạy offline được khi mở qua **https://**. Mở tệp trực tiếp trên máy hoặc mở trong Claude thì không cài được.
Cách nhanh nhất, miễn phí:
1. Vào **https://app.netlify.com/drop**.
2. Kéo thả **cả thư mục** này (đã giải nén) vào trang → nhận địa chỉ dạng `https://ten-ngau-nhien.netlify.app`.
3. (Tuỳ chọn) Đăng nhập Netlify để giữ trang lâu dài và đổi tên miền.

Cách khác: GitHub Pages, Cloudflare Pages, Vercel. Chỉ cần đưa nguyên các tệp lên.

## 2. Cài vào màn hình chính
- **Android (Chrome):** mở địa chỉ → menu ⋮ → **Cài đặt ứng dụng**. Hoặc bấm nút trạng thái trên app → **Cài đặt ứng dụng**.
- **iPhone/iPad (Safari):** mở địa chỉ bằng Safari → nút **Chia sẻ** → **Thêm vào MH chính** → **Thêm**.
- Mở app **một lần khi có mạng** để app lưu giao diện. Sau đó dùng được khi mất mạng.

## 3. Chuyển dữ liệu từ bản trong Claude sang
1. Mở bản trong Claude → bấm nút trạng thái 🟢 ở góc trên → **Tải tệp sao lưu (.json)**.
2. Mở app PWA → nút trạng thái → **Khôi phục từ tệp** → chọn tệp vừa tải.

## 4. Khi mất mạng
- Vẫn xem, thêm, sửa, xoá mọi thứ như bình thường. Dữ liệu lưu ngay trên máy (IndexedDB).
- Góc trên hiện **🔴 Ngoại tuyến · n thay đổi chờ đồng bộ**, kèm thanh thông báo đỏ.
- Có mạng lại: hiện **🟢 Đã có Internet trở lại**. Nếu đã cài máy chủ đồng bộ, app tự đồng bộ.

## 5. Lưu ý
- Dữ liệu nằm trên **từng thiết bị**. Nên **tải tệp sao lưu** định kỳ hoặc cài máy chủ đồng bộ (thư mục `server/`).
- Trên iPhone, Safari có thể xoá dữ liệu của trang **chưa cài** nếu lâu không mở. Hãy cài vào màn hình chính để tránh việc này.
- Xoá dữ liệu trình duyệt hoặc gỡ app sẽ xoá dữ liệu trên máy đó.
- Khi có bản mới, app hiện **"Có phiên bản mới – Cập nhật"**.

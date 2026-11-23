# Sổ Cá Nhân – Ứng dụng PWA chạy cả khi không có mạng

> Từ bản **1.3.0**, app **chạy độc lập, không phụ thuộc Claude**: dữ liệu lưu trên từng thiết bị và đồng bộ qua máy chủ Railway của bạn (**URL + mã SYNC_TOKEN**).

## Trong thư mục
| Tệp | Vai trò |
|---|---|
| `index.html` | Toàn bộ ứng dụng |
| `manifest.webmanifest` | Thông tin để cài lên màn hình chính (tên, biểu tượng, màu) |
| `sw.js` | Service Worker: lưu giao diện để mở khi mất mạng + đồng bộ nền với máy chủ |
| `icons/` | Biểu tượng cho Android, iPhone, trình duyệt |
| `_headers` | Cấu hình bộ nhớ đệm cho Netlify / Cloudflare Pages |
| `server.js` | Máy chủ gộp: phục vụ app + đồng bộ (dùng cho Railway) |
| `server/` | Lõi đồng bộ (`sync-core.js`) + máy chủ chỉ đồng bộ (`sync-server.js`) |
| `package.json`, `railway.json` | Cấu hình chạy trên Railway |
| `kiem-tra/` | Kết quả kiểm tra ngắt mạng thực tế + ảnh chụp |

## 1. Đưa lên mạng (bắt buộc có HTTPS)
PWA chỉ cài và chạy offline được khi mở qua **https://**. Mở tệp trực tiếp trên máy thì không cài được.
Cách nhanh nhất, miễn phí:
1. Vào **https://app.netlify.com/drop**.
2. Kéo thả **cả thư mục** này (đã giải nén) vào trang → nhận địa chỉ dạng `https://ten-ngau-nhien.netlify.app`.
3. (Tuỳ chọn) Đăng nhập Netlify để giữ trang lâu dài và đổi tên miền.

Cách khác: GitHub Pages, Cloudflare Pages, Vercel. Chỉ cần đưa nguyên các tệp lên.

## 1b. Chạy trên Railway (app + đồng bộ cùng một địa chỉ) – đang dùng
Repo đã có sẵn `server.js`, `package.json` và `railway.json`. Railway tự chạy `node server.js`: vừa phục vụ app, vừa đồng bộ qua `/sync`.
Địa chỉ hiện tại: **https://sotaycanhan-production.up.railway.app**

Cần làm **một lần** trên Railway (mở dự án → chọn dịch vụ):
1. **Variables** → thêm `SYNC_TOKEN` = một chuỗi bí mật dài (VD 32 ký tự ngẫu nhiên). Chưa đặt thì app vẫn chạy nhưng **đồng bộ bị tắt** (báo "Máy chủ chưa đặt SYNC_TOKEN").
2. **Volume** → bấm chuột phải vào dịch vụ → **Attach Volume** → Mount path: `/data`. Railway tự báo đường dẫn cho máy chủ, dữ liệu lưu ở `/data/data.json`.
   - Không gắn Volume: mỗi lần triển khai lại, dữ liệu trên máy chủ **bị xoá**. App tự phát hiện và **gửi lại toàn bộ dữ liệu từ thiết bị**, nhưng nếu không còn thiết bị nào giữ dữ liệu thì sẽ mất. **Nên gắn Volume.**
3. Trong app: nút trạng thái → **Máy chủ đồng bộ** → địa chỉ `https://sotaycanhan-production.up.railway.app` + mã `SYNC_TOKEN` → **Lưu & đồng bộ**. Làm trên từng thiết bị.

Kiểm tra máy chủ: mở `https://sotaycanhan-production.up.railway.app/health` → thấy `"sync":true` là đã bật đồng bộ.

## 2. Cài vào màn hình chính
- **Android (Chrome):** mở địa chỉ → menu ⋮ → **Cài đặt ứng dụng**. Hoặc bấm nút trạng thái trên app → **Cài đặt ứng dụng**.
- **iPhone/iPad (Safari):** mở địa chỉ bằng Safari → nút **Chia sẻ** → **Thêm vào MH chính** → **Thêm**.
- Mở app **một lần khi có mạng** để app lưu giao diện. Sau đó dùng được khi mất mạng.

## 3. Kết nối thiết bị với máy chủ Railway
Làm **một lần trên mỗi thiết bị**:
1. Mở app qua `https://sotaycanhan-production.up.railway.app` (nên cài vào màn hình chính).
2. Bấm nút trạng thái ở góc trên → mục **🔄 Máy chủ đồng bộ (URL + mã SYNC_TOKEN)**.
3. Ô địa chỉ đã **điền sẵn** địa chỉ máy chủ → nhập **mã SYNC_TOKEN** → **Lưu & đồng bộ**.
4. Thấy **🟢 Đã đồng bộ** là xong. Thiết bị mới sẽ nhận toàn bộ dữ liệu từ máy chủ; dữ liệu mẫu trên máy mới **không đè** dữ liệu thật.

**Chuyển dữ liệu cũ từ bản trong Claude (nếu có):** mở bản trong Claude → nút trạng thái → **Tải tệp sao lưu (.json)** → mở app Railway → nút trạng thái → **Khôi phục từ tệp** → dữ liệu tự đồng bộ lên máy chủ.

## 4. Khi mất mạng
- Vẫn xem, thêm, sửa, xoá mọi thứ như bình thường. Dữ liệu lưu ngay trên máy (IndexedDB).
- Góc trên hiện **🔴 Ngoại tuyến · n thay đổi chờ đồng bộ**, kèm thanh thông báo đỏ.
- Có mạng lại: hiện **🟢 Đã có Internet trở lại**. Nếu đã cài máy chủ đồng bộ, app tự đồng bộ.

## 4b. Đồng bộ khi đã đóng app (từ bản 1.1.0)
Khi đã cài máy chủ đồng bộ, Service Worker (`sw.js`) tự đồng bộ cả khi app **không mở**:
| Tình huống | Cách hoạt động | Thiết bị hỗ trợ |
|---|---|---|
| Nhập khi mất mạng rồi đóng app | Có mạng lại, trình duyệt tự gửi thay đổi lên máy chủ (Background Sync) | Android, Chrome, Edge |
| Thoát app khi còn thay đổi chưa gửi | Service Worker gửi tiếp sau khi app đã ẩn | Mọi trình duyệt (iPhone chỉ trong vài giây) |
| Máy khác vừa sửa dữ liệu | Định kỳ khoảng 6 giờ, kéo dữ liệu mới về (Periodic Sync) | App **đã cài** trên Android/Chrome |
| Lỗi mạng hoặc máy chủ tạm lỗi | Trình duyệt tự thử lại sau | Android, Chrome, Edge |

- Trang và Service Worker dùng chung một khoá nên **không bao giờ gửi trùng** cùng lúc.
- **iPhone/Safari** chưa hỗ trợ đồng bộ nền: mở app là app tự đồng bộ.
- Xem tình trạng: bấm nút trạng thái ở góc trên → dòng **Đồng bộ khi đóng app**.

## 5. Lưu ý
- **Tệp sách đính kèm (PDF, TXT)** chỉ lưu trên thiết bị đã tải lên, không đồng bộ sang máy khác (thông tin sách, tiến độ đọc vẫn đồng bộ).
- Dữ liệu nằm trên **từng thiết bị**. Nên **tải tệp sao lưu** định kỳ hoặc cài máy chủ đồng bộ (thư mục `server/`).
- Trên iPhone, Safari có thể xoá dữ liệu của trang **chưa cài** nếu lâu không mở. Hãy cài vào màn hình chính để tránh việc này.
- Xoá dữ liệu trình duyệt hoặc gỡ app sẽ xoá dữ liệu trên máy đó.
- Khi có bản mới, app hiện **"Có phiên bản mới – Cập nhật"**.

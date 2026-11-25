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
| `server/` | Lõi đồng bộ, lưu trữ (tệp/Postgres), thông báo đẩy, sao lưu GitHub, công cụ kiểm tra sao lưu |
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
Địa chỉ: **https://sotaycanhan-production.up.railway.app** · Vùng: **Southeast Asia (Singapore)**.
Repo có sẵn `server.js`, `package.json`, `railway.json`: Railway tự cài thư viện và chạy `node server.js`.

### Biến môi trường trên Railway (dịch vụ Sotaycanhan → Variables)
| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `SYNC_TOKEN` | ✅ | Mã đồng bộ (nhập vào app trên từng thiết bị). Chưa đặt → đồng bộ tắt. |
| `DATABASE_URL` | ✅ khuyên dùng | `${{Postgres.DATABASE_URL}}` – lưu dữ liệu vào Postgres, **không mất khi triển khai lại**. Không có thì cần Volume `/data`. |
| `GITHUB_TOKEN` | Tuỳ chọn | Bật **sao lưu hằng tuần lên GitHub** (xem mục 6). |
| `BACKUP_KEY` | Tuỳ chọn | Khoá mã hoá bản sao lưu. Không đặt thì dùng `SYNC_TOKEN` – **nên đặt riêng** để đổi `SYNC_TOKEN` không ảnh hưởng bản sao cũ. |
| `BACKUP_WEEKDAY`, `BACKUP_HOUR` | Tuỳ chọn | Lịch sao lưu (mặc định Chủ nhật 20 giờ, giờ Việt Nam; 0 = Chủ nhật … 6 = Thứ 7). |

Kiểm tra máy chủ: mở `…/health` → `"sync":true` (đồng bộ bật) · `"storage":"postgres"` (lưu bền vững) · `"push":true` · `"backup":true` (đã đặt GITHUB_TOKEN).

### Đổi vùng (region) an toàn
Trước khi đổi: app → nút trạng thái → **☁️ Tải bản sao máy chủ** (toàn bộ dữ liệu máy chủ, khôi phục được bằng **Khôi phục từ tệp**). Sau đó Railway → Settings → Regions → chọn vùng mới. Dùng Postgres thì dữ liệu nằm ở dịch vụ Postgres, không phụ thuộc vùng của app.

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

## 4c. Đồng bộ tức thời (từ bản 1.4.0)
- App đang mở giữ một kênh kết nối với máy chủ: **máy khác thêm/sửa → máy này nhận sau khoảng 0,6 giây** (trước đây tới 60 giây).
- Mất kênh (máy chủ khởi động lại, mạng chập chờn) → tự nối lại sau vài giây; trong lúc đó vẫn tự hỏi máy chủ mỗi 15 giây.
- Bảng trạng thái có dòng **Đồng bộ tức thời: ⚡ Đang kết nối**.

## 4d. Thông báo đẩy
- Bật trên **từng thiết bị**: nút trạng thái → **🔔 Bật thông báo** → cho phép → **Gửi thử** để kiểm tra.
- Nhận thông báo khi **thiết bị khác thêm dữ liệu mới** (VD "Chi 150.000 đ · Ăn uống · từ Android · Chrome"), nhiều mục liền nhau gom thành 1 thông báo; thiết bị đang mở app thì không báo (đã thấy ngay). Bấm thông báo → mở **Lịch sử giao dịch**.
- Nhận thông báo **sao lưu hằng tuần** (thành công / lỗi / nhắc tải tệp nếu chưa bật GitHub).
- **iPhone/iPad:** cần iOS 16.4+, **Thêm vào MH chính** rồi mở app từ biểu tượng mới bật được.

## 4d2. Thông báo biến động – như tin nhắn ngân hàng (từ bản 1.7.0)
Mỗi khi có **dữ liệu mới** (nhập trên bất kỳ máy nào, kể cả máy đang dùng), mọi máy đã bật thông báo nhận ngay:
| Loại | Ví dụ thông báo |
|---|---|
| Chi / thu | **💸 Chi −150.000 đ · Ăn uống** — TK VCB · số dư 9.850.000 đ · Luỹ kế Ăn uống tháng 11/2026: 350.000 đ (2 GD) · “Phở” · ngày 24/11 · từ Điện thoại A |
| Chuyển khoản | **🔁 Chuyển khoản 2.000.000 đ** — VCB → Tiền mặt · số dư cả 2 tài khoản |
| Trả nợ | **🏦 Trả nợ −11.000.000 đ** — số dư TK · Tổng dư nợ còn lại |
| Tiết kiệm / Vay / Tài sản | Số tiền + **tổng tiết kiệm đang gửi / tổng dư nợ / tổng giá trị tài sản** |
| Tài khoản mới | Số dư ban đầu + tổng số dư mọi tài khoản |
| Sức khỏe, ghi chú, sự kiện… | Nội dung chính (VD Cân nặng 70,5 kg · Huyết áp 120/80) |
- Số dư là số dư **ngay sau giao dịch đó** (nhập nhiều giao dịch liền nhau vẫn đúng từng bước); nhập hàng loạt > 3 mục → 1 thông báo tóm tắt.
- Không báo khi: sửa mục cũ, dữ liệu mẫu, khôi phục dữ liệu cũ, thay đổi cài đặt.
- Tuỳ chọn từng máy (👤 → 🔔 Thông báo): bật/tắt báo dữ liệu mới · **báo cả mục do chính máy này nhập** · **hiện số tiền & số dư** (tắt → hiện •••, hợp khi lo người khác nhìn màn hình khoá).

## 4d3. Thêm thu chi nhanh: đính kèm ảnh giao dịch & gõ nhanh (từ bản 1.8.0)
**📷 Ảnh GD – tự đọc số tiền đã thanh toán / đã nhận** (form Thêm giao dịch):
- Bấm **📷 Ảnh GD** chọn ảnh chụp màn hình chuyển khoản / thanh toán / nhận tiền, hoặc **dán ảnh** (Ctrl+V), hoặc trên Android: app ngân hàng → **Chia sẻ → Sổ Cá Nhân**.
- App tự đọc: **số tiền**, **Chi (đã thanh toán) / Thu (đã nhận)**, ngày giờ, nội dung chuyển khoản, người nhận/người chuyển, mã giao dịch; đoán danh mục (điện, nước, lương, xăng…; không đoán được → "Khác") rồi **điền sẵn** – kiểm tra rồi bấm Lưu.
- Khung **xanh** quanh số tiền trên ảnh = chắc chắn; khung **vàng** + ô số tiền tô vàng = cần đối chiếu lại.
- Cùng mã giao dịch đã nhập → cảnh báo **trùng**. Ảnh thu nhỏ lưu **trên máy đã nhập** (không gửi lên máy chủ).
- Chạy **ngay trên điện thoại** (Tesseract + tiếng Việt), **miễn phí**, ảnh **không rời máy**; lần đầu tải bộ đọc ~2,9 MB, sau đó dùng được cả khi **mất mạng**.
- Cũng có thể **dán nội dung tin nhắn biến động số dư** vào ô gõ nhanh → app tự phân tích.

**Gõ nhanh** (ô trên cùng của form): `@thu/chi@chi tiết số-tiền`
| Gõ | Kết quả |
|---|---|
| `@c` | gợi ý 💸 Chi · 🔁 Chuyển khoản |
| `@chi@tiendien 845k` → Enter | Chi · Điện · 845.000 |
| `@chi@dien` | gợi ý danh mục Điện + các lần chi trước có chữ "điện" (chọn → điền lại ghi chú & tài khoản cũ) |
| `@thu@luong 20tr5` | Thu · Lương · 20.500.000 |
| `@chi@xang 1,5tr` | Chi · Đi lại · 1.500.000 |
Gõ **không dấu** được; số tiền: `845k`, `1tr5`, `2,5tr`, `2 trieu`, `845.500`, `1ty`; ↑ ↓ chọn gợi ý, Enter để áp dụng.

## 4e. Lịch sử giao dịch (Tài chính → Lịch sử)
- **📜 Sao kê:** mọi giao dịch của một hoặc tất cả tài khoản, **số dư sau từng giao dịch (SD)**, tổng theo tháng; lọc 30 ngày / 3 tháng / 12 tháng / năm nay / tất cả; tiền vào / tiền ra / chuyển khoản; tìm theo nội dung, ghi chú, số tiền; sao chép CSV.
- Xem tất cả tài khoản: chuyển khoản nội bộ hiện 1 dòng ⇄, không tính vào tiền vào/ra.
- **🕘 Mới nhập gần đây:** 60 giao dịch nhập/sửa mới nhất (kể cả từ thiết bị khác) kèm giờ nhập.

## 6. Sao lưu hằng tuần lên GitHub (chuỗi số hoá để kiểm tra)
Máy chủ tự sao lưu mỗi tuần vào nhánh **`sao-luu-du-lieu`** của repo (nhánh riêng, không ảnh hưởng code):
- Dữ liệu **mã hoá AES-256-GCM** (repo đang công khai – không ai đọc được nếu không có mã).
- `danh-muc.json`: mỗi bản có **SHA-256** của dữ liệu + **chuỗi băm** nối các tuần → sửa, xoá hay chèn bất kỳ bản nào đều bị phát hiện.

**Bật (một lần):**
1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token: Repository access = **Only select repositories → Sotaycanhan**; Permissions → **Contents: Read and write**; đặt hạn dùng (VD 1 năm).
2. Railway → Variables → thêm `GITHUB_TOKEN` = token vừa tạo (và nên thêm `BACKUP_KEY` = một mã ngẫu nhiên dài, **lưu cẩn thận** – mất là không giải mã được).
3. App → nút trạng thái → **🗄️ Sao lưu ngay** để chạy thử.

**Kiểm tra / giải mã** (trên máy có Node.js, trong thư mục repo):
```
node server/kiem-tra-sao-luu.js
node server/kiem-tra-sao-luu.js --khoa-tep "C:\Users\<tên>\Documents\SoCaNhan-SYNC_TOKEN.txt"
node server/kiem-tra-sao-luu.js --khoa-tep "<tệp chứa mã>" --xuat moi-nhat
```
Lệnh 1 kiểm tra chuỗi băm (không cần mã) · lệnh 2 giải mã thử từng bản và so SHA-256 · lệnh 3 xuất bản mới nhất ra tệp `.json` → app → **Khôi phục từ tệp**. Tệp chứa mã: `BACKUP_KEY` nếu có đặt, nếu không là `SYNC_TOKEN`.

## 4f. Đăng nhập: ID / SĐT, mật khẩu, vân tay / Face ID (từ bản 1.5.0)
**Tạo tài khoản chủ (một lần, trên máy đang đồng bộ):** nút trạng thái → **🔐 Tài khoản & bảo mật → Tạo tài khoản chủ** → nhập **ID** (chữ thường không dấu), **số điện thoại** (riêng tư), **mật khẩu ≥ 8 ký tự** → app hỏi **Bật mở khoá bằng vân tay / Face ID** → đồng ý.
- Dữ liệu hiện có **giữ nguyên** cho tài khoản này.
- Từ lúc đó, **mọi thiết bị phải đăng nhập** (ID hoặc SĐT + mật khẩu, hoặc vân tay / Face ID). Mã `SYNC_TOKEN` **không còn mở được dữ liệu** – chỉ dùng để **đặt lại mật khẩu** khi quên.
- Các máy khác đang dùng mã cũ sẽ tự hiện màn hình **Đăng nhập** → đăng nhập 1 lần → tiếp tục đồng bộ như cũ.

**Giao diện Sáng / Tối và ngôn ngữ Tiếng Việt / English (từ bản 1.13.0):** chọn ở ⚙️ Ứng dụng & dữ liệu, 👤 Tài khoản › 🎨 Giao diện & ngôn ngữ, hoặc nút nhanh 🌙 / EN dưới màn đăng nhập. *Theo máy* = tự đổi theo chế độ sáng/tối của điện thoại. Lựa chọn lưu riêng trên từng máy. English: từ điển `assets/i18n-en.json` (~2.650 cụm) chỉ tải khi chọn, được lưu sẵn để dùng khi mất mạng; dữ liệu bạn nhập (ghi chú, tên tài khoản…) không bị đổi. Tên can chi âm lịch và nội dung đọc dài (truyện, tóm tắt sách) giữ tiếng Việt. Thêm chữ mới vào app: chạy lại bộ trích chữ rồi bổ sung bản dịch vào tệp từ điển.

**Face ID / vân tay trên điện thoại (từ bản 1.12.0):** iPhone (iCloud Keychain) và Android (Google Password Manager) luôn tạo khoá sinh trắc dạng *đồng bộ* cho web app – khác app ngân hàng / VNeID là app cài đặt, được dùng thẳng chip bảo mật. App nhận khoá đồng bộ nhưng **gắn máy**: mỗi lần bật, app tạo 1 mã bí mật 256 bit chỉ lưu trên máy đó, máy chủ giữ bản băm SHA-256. Máy khác cùng tài khoản Apple / Google dù có bản sao khoá cũng không có mã → bị từ chối; máy đó đăng nhập bằng mật khẩu rồi bật Face ID riêng. Muốn quay lại chính sách cũ (chỉ nhận khoá 1 thiết bị, điện thoại không bật được): đặt biến Railway `BIO_DEVICE_ONLY=1`.

**Giao diện đăng nhập (từ bản 1.11.0):** ảnh nền tài chính – **ảnh dọc** trên điện thoại / máy tính bảng dọc, **ảnh ngang** trên web (laptop, màn hình lớn); khung kính mờ (trên điện thoại ở phần trời tối phía trên, trên web ở bên trái). Ảnh nằm trong `assets/`, lưu sẵn để màn hình khoá hiện cả khi mất mạng. Thay ảnh: ghi đè `assets/dang-nhap-dien-thoai.webp` (dọc) và `assets/dang-nhap-web.webp` (ngang).

**Khoá app:** khoá khi mở app và sau **5 phút** không dùng (đổi được: 1 / 5 / 15 / 30 phút hoặc chỉ khi mở app). Mở bằng **👆 vân tay / Face ID / Windows Hello** hoặc mật khẩu – **chạy cả khi mất mạng**.

**Trang Tài khoản (nút 👤 ở góc trên, từ bản 1.6.0)** – chấm xanh trên 👤 = đã đăng nhập:
| Mục | Quản lý |
|---|---|
| 🪪 Hồ sơ | ID đăng nhập, số điện thoại (sửa cần mật khẩu hiện tại) |
| 🔐 Đăng nhập & bảo mật | Đổi mật khẩu (tuỳ chọn đăng xuất máy khác) · tự khoá app (1/5/15/30 phút / chỉ khi mở) · vân tay / Face ID của từng máy (bật / xoá) · khoá ngay |
| 🔔 Thông báo | Bật / tắt / gửi thử trên máy này · chọn loại: **dữ liệu mới từ thiết bị khác**, **sao lưu hằng tuần** · danh sách máy đang nhận thông báo |
| 💻 Thiết bị đã đăng nhập | Tên máy, đăng nhập bằng gì, lúc nào, hoạt động gần nhất, có nhận thông báo không · **Thu hồi** từng máy · đăng xuất mọi máy khác |

Thu hồi một máy (VD bị mất) → máy đó bị đăng xuất, **không đồng bộ** và **không nhận thông báo** nữa; vân tay đã xoá không mở được app trên máy đó khi có mạng.

**An toàn (rà soát bản 1.6.0):** chống dò mật khẩu cả khi đổi địa chỉ IP (10 lần sai / 15 phút → khoá mật khẩu, vân tay vẫn đăng nhập được) · thời gian phản hồi như nhau dù ID đúng hay sai (không đoán được ID/SĐT) · `/health` công khai chỉ trả "ok" · không cho trang web khác gọi máy chủ (CORS) · chống nhúng trang (clickjacking), bắt buộc HTTPS · mật khẩu băm scrypt (máy chủ) và PBKDF2 (máy, để mở khi mất mạng) – không lưu dạng chữ · vân tay không rời khỏi máy (chuẩn WebAuthn / passkey, máy chủ chỉ giữ khoá công khai) · sai mật khẩu 5 lần → khoá 15 phút (tăng dần) · ID / SĐT không hiện ở bất kỳ đường dẫn công khai nào.

**Quên mật khẩu:** màn hình đăng nhập → **Quên mật khẩu?** → nhập mã `SYNC_TOKEN` (trong Railway → Variables) + mật khẩu mới → mọi máy khác bị đăng xuất.

**Sinh trắc thiết bị – không dùng passkey đồng bộ (từ bản 1.9.0):**
| Hạng mục | Cách làm |
|---|---|
| Loại khoá | Chỉ cảm biến **gắn trong máy** (`platform`), **không tạo passkey** trong iCloud Keychain / Google Password Manager (`residentKey: discouraged`), **bắt buộc xác thực** sinh trắc / khoá màn hình thiết bị (`userVerification: required`) |
| Chính sách | Máy chủ **từ chối khoá đồng bộ đám mây** (cờ sao lưu BE/BS) khi đăng ký **và mỗi lần dùng**; số đếm chữ ký không tăng → coi là khoá bị sao chép, chặn. Nới bằng biến `BIO_ALLOW_SYNCED=1` (không khuyến nghị) |
| Không cá nhân hoá | Khoá chỉ mang tên chung "Sổ Cá Nhân", mã người dùng ngẫu nhiên – **không** chứa ID, SĐT, họ tên |
| CSDL riêng – máy chủ | Bảng **`scn_sinh_trac`** trong Postgres (tự tạo nếu chưa có; không có Postgres → tệp `sinh-trac.json`), tách khỏi hồ sơ tài khoản & dữ liệu sổ |
| CSDL riêng – thiết bị | IndexedDB **`so-ca-nhan-sinh-trac`**: lưu khoá công khai của cảm biến máy này |
| Mở khoá có mạng | Máy chủ phát thử thách & **kiểm chữ ký** (đồng thời kiểm khoá còn hợp lệ, chưa bị xoá / đồng bộ) |
| Mở khoá mất mạng | **Kiểm chữ ký ngay trên máy** bằng khoá công khai (ES256 / RS256 / Ed25519), kiểm cờ xác thực người dùng & số đếm |
| Thu hồi / đặt lại mật khẩu | Xoá khoá sinh trắc của máy đó khỏi CSDL; tự đăng xuất thì giữ (đăng nhập lại bằng vân tay được) |
**Xác thực lại cho thao tác nhạy cảm (từ bản 1.10.0 – tương tự app ngân hàng yêu cầu sinh trắc khi chuyển khoản lớn):**
- **Luôn yêu cầu** (máy chủ kiểm, hiệu lực 5 phút – biến `STEPUP_SEC`): thêm / xoá vân tay, thu hồi thiết bị, tải / sao lưu toàn bộ dữ liệu máy chủ; trên máy: tải tệp sao lưu, xoá dữ liệu tài chính.
- **Tuỳ chọn** (👤 Tài khoản): lưu / xoá giao dịch từ 5 / 10 / 20 / 50 / 100 triệu (tham khảo QĐ 2345/QĐ-NHNN: giao dịch > 10 triệu phải xác thực sinh trắc).
- Cách xác thực: 👆 sinh trắc thiết bị (có mạng: máy chủ kiểm chữ ký; mất mạng: kiểm trên máy) hoặc mật khẩu.
- Nhận diện bộ xác thực qua **AAGUID** (Windows Hello, Chrome trên Mac, Google Password Manager, iCloud Keychain, 1Password, Bitwarden, Dashlane…): loại đồng bộ đám mây bị chặn thêm một lớp ngoài cờ BE/BS.

**Vì sao app ngân hàng / VNeID dùng được sinh trắc ở mọi máy còn web thì hạn chế:** app cài đặt gọi thẳng API hệ điều hành – Android `BiometricPrompt` + Keystore (`setUserAuthenticationRequired`, `BIOMETRIC_STRONG`, `setInvalidatedByBiometricEnrollment`, StrongBox, Key Attestation, Play Integrity); iOS `LocalAuthentication` + Secure Enclave (`.biometryCurrentSet`, `ThisDeviceOnly`, App Attest); VNeID / ngân hàng còn đọc chip CCCD qua NFC (ICAO 9303: DG1, DG2 ảnh, SOD) và so khớp khuôn mặt + liveness. Trình duyệt **không mở** các API này – chỉ có WebAuthn; Safari trên iPhone luôn tạo khoá đồng bộ iCloud; Web NFC không đọc được chip CCCD. Muốn đạt mức như app ngân hàng cần **bọc thành app cài đặt** (VD Capacitor / TWA cho Android – miễn phí; iOS cần tài khoản Apple Developer, có phí).

- Dữ liệu vân tay / khuôn mặt **không bao giờ rời chip bảo mật của thiết bị** – app & máy chủ chỉ nhận chữ ký số sau khi thiết bị đã xác thực.
- ⚠️ **iPhone / iPad (Safari)** chỉ tạo được khoá đồng bộ iCloud → theo chính sách này **không bật được Face ID / Touch ID**, máy đó dùng mật khẩu. Android / Windows Hello / máy tính: tuỳ thiết bị – app sẽ báo rõ nếu bị từ chối.
- Web không phân biệt được "vân tay" với "mã PIN / hình vẽ khoá màn hình" của thiết bị: cả hai đều là xác thực người dùng của thiết bị.

**Lưu ý:**
- Vân tay / Face ID gắn với tên miền `sotaycanhan-production.up.railway.app`. Đổi sang tên miền khác thì cần bật lại vân tay (mật khẩu vẫn dùng được).
- iPhone/iPad: Face ID / Touch ID hoạt động trong Safari và app đã thêm vào MH chính (iOS 16+).
- Khoá app là **khoá màn hình**: dữ liệu trên máy không bị mã hoá. Mất máy → vào máy khác → **Thu hồi** máy đó (máy mất sẽ không đồng bộ được nữa).

## 5. Lưu ý
- **Tệp sách đính kèm (PDF, TXT)** chỉ lưu trên thiết bị đã tải lên, không đồng bộ sang máy khác (thông tin sách, tiến độ đọc vẫn đồng bộ).
- Dữ liệu nằm trên **từng thiết bị**. Nên **tải tệp sao lưu** định kỳ hoặc cài máy chủ đồng bộ (thư mục `server/`).
- Trên iPhone, Safari có thể xoá dữ liệu của trang **chưa cài** nếu lâu không mở. Hãy cài vào màn hình chính để tránh việc này.
- Xoá dữ liệu trình duyệt hoặc gỡ app sẽ xoá dữ liệu trên máy đó.
- Khi có bản mới, app hiện **"Có phiên bản mới – Cập nhật"**.

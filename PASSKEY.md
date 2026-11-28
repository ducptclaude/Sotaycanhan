# Passkey / Face ID / Touch ID – bàn giao triển khai (bản 1.15.0)

Triển khai theo `README_PASSKEY_IOS.md` trên kiến trúc hiện có, **không viết lại app, không đổi giao diện / theme**.

## 1. Stack phát hiện & quyết định

| Mục | Thực tế trong repo | Quyết định |
|---|---|---|
| Backend | Node.js ≥ 20, máy chủ `http` thuần (`server.js`), không framework | Giữ nguyên, thêm route vào `server/auth.js` |
| WebAuthn | `@simplewebauthn/server` 13.3.3 (đã có từ bản 1.5) | Giữ thư viện chuẩn – không tự viết thuật toán xác minh |
| Frontend | 1 tệp `index.html` (JS thuần) + Service Worker `sw.js` – không bundler | Gọi `navigator.credentials` trực tiếp (không thêm `@simplewebauthn/browser` vì app không có bước build) |
| Phiên | Token Bearer ngẫu nhiên lưu trong IndexedDB (không cookie, không localStorage) → không có rủi ro CSRF kiểu cookie | Giữ nguyên |
| Database | Postgres (`DATABASE_URL`) trên Railway, dự phòng tệp | Bảng tự tạo / tự thêm cột khi khởi động (không cần lệnh migration riêng) |
| Route | Theo convention sẵn có `/auth/bio/*` (alias `/auth/passkey/*`) thay cho `/api/passkey/*` gợi ý | Ánh xạ bảng §2 |
| Chính sách | Chủ dự án chọn **giữ GẮN MÁY** (passkey chỉ dùng trên đúng máy đã bật) | Mặc định `BIO_BIND=1`; đặt `BIO_BIND=0` để cho passkey đồng bộ iCloud/Google dùng mọi máy |

## 2. API (ánh xạ với tài liệu)

| Tài liệu | Đường dẫn trong app | Ghi chú |
|---|---|---|
| POST `/api/passkey/register/options` | POST `/auth/bio/register-options` | Cần phiên + **xác thực lại gần đây** (step-up 5 phút) |
| POST `/api/passkey/register/verify` | POST `/auth/bio/register` | Challenge gắn phiên; lưu credential cho tài khoản của **phiên**, không tin ID client gửi |
| POST `/api/passkey/login/options` | POST `/auth/bio/login-options` | `{ discoverable: true }` → không gửi `allowCredentials` (đăng nhập không cần ID) |
| POST `/api/passkey/login/verify` | POST `/auth/bio/login` | Kiểm challenge, origin, RP ID, chữ ký, UV, user handle, counter, mã gắn máy → cấp phiên mới |
| GET `/api/passkey/credentials` | GET `/auth/bio/credentials` | Chỉ passkey của tài khoản (cần phiên) |
| DELETE `/api/passkey/credentials/:id` | POST `/auth/bio/delete` | Cần xác thực lại |
| (đổi tên) | POST `/auth/bio/rename` | `{ id, name }` |
| (mở khoá app) | POST `/auth/bio/unlock-options` · `/auth/bio/unlock` | Mở khoá = xác thực lại cho thao tác nhạy cảm |

## 3. Bảo mật đã áp dụng

- **Đăng ký**: `residentKey: 'required'`, `requireResidentKey: true`, `userVerification: 'required'`, `attestation: 'none'`, ưu tiên `authenticatorAttachment: 'platform'`; **user handle ổn định & ngẫu nhiên** (16 byte, không phải ID / SĐT / email); `excludeCredentials` loại khoá đã có trên chính máy đó; hỗ trợ nhiều passkey.
- **Challenge**: bảng `scn_challenge` (Postgres) – hạn 5 phút (`CHALLENGE_TTL_SEC`), **dùng một lần** (`DELETE … RETURNING` nguyên tử), gắn **loại thao tác** (register / login / unlock) và **phiên**; bền qua khởi động lại / nhiều phiên bản máy chủ. Không ghi challenge, token ra log.
- **Xác minh**: origin & RP ID cố định từ `RP_ID` / `ORIGIN` (mặc định `RAILWAY_PUBLIC_DOMAIN`), không wildcard, không tin `X-Forwarded-Host`; counter theo thư viện (passkey đồng bộ counter = 0 không bị chặn sai); user handle phải khớp tài khoản.
- **Chống dò**: giới hạn số lần sai theo IP + toàn hệ thống (đã có).
- **Không lưu**: khoá bí mật, ảnh khuôn mặt, mẫu vân tay, mã khoá iPhone, CCCD. Chỉ lưu khoá công khai + metadata (`deviceType`, `backedUp`, AAGUID).
- **Service Worker** không lưu đệm `/auth`, `/sync`, `/admin`… (đi thẳng máy chủ).
- **Mật khẩu & khôi phục** (`BACKUP_TOKEN`) giữ nguyên – mất passkey vẫn vào được.
- Giao diện **không khẳng định** đã dùng khuôn mặt / vân tay (iOS có thể cho dùng mật mã máy); có giải thích trong 👤 Tài khoản.

## 4. Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `server/challenge-store.js` | **Mới** – kho challenge bền (Postgres `scn_challenge` / bộ nhớ) |
| `server/auth.js` | Resident key, user handle ổn định & kiểm tra, discoverable login, challenge gắn phiên, GET credentials, rename, `RP_NAME` / `ORIGIN`, `BIO_BIND` |
| `server/bio-db.js` | Cột `user_handle` (thêm tự động, giữ dữ liệu cũ) |
| `server.js` | Mở kho challenge, truyền cho `createAuth` |
| `index.html` | Đăng nhập không cần ID khi máy chưa có passkey; đổi tên passkey; lời giải thích; thông báo lỗi (huỷ / không hỗ trợ / không HTTPS); nhãn trợ năng "Face ID / Touch ID (Passkey)" |
| `assets/i18n-en.json` | Bản dịch chuỗi mới |
| `.env.example` | **Mới** – danh sách biến (không có giá trị bí mật) |
| `PASSKEY.md` | Tài liệu này |

Migration: **tự động, không phá dữ liệu** – `CREATE TABLE IF NOT EXISTS scn_challenge`, `ALTER TABLE scn_sinh_trac ADD COLUMN IF NOT EXISTS user_handle`. Không có dependency mới.

## 5. Kết quả kiểm thử (WebAuthn virtual authenticator – Chrome)

Tự động (đã chạy, tất cả ĐẠT – chi tiết `kiem-tra/ket-qua-v1.15-passkey.txt`):

- Lượt A (mặc định): tham số đăng ký đúng · user handle ổn định, không cá nhân hoá · CSDL lưu khoá công khai + user handle · đăng xuất → đăng nhập lại bằng passkey (phiên `bio`) · nhiều passkey + API liệt kê · chưa đăng nhập không xem được · đổi tên · máy khác có bản sao passkey bị chặn (gắn máy) · passkey đã thu hồi bị từ chối · mật khẩu vẫn dùng được – **10/10**
- Lượt B: challenge hết hạn · replay · sai loại thao tác · challenge của phiên khác · sai chữ ký · thiếu user verification – **6/6 bị từ chối**
- Lượt C: sai ORIGIN · sai RP ID – **2/2 bị từ chối**
- Lượt D (`BIO_BIND=0`): máy khác cùng iCloud đăng nhập không cần ID · user handle sai bị từ chối – **2/2**
- Lượt E (Postgres): bảng cũ được thêm cột, khoá cũ giữ nguyên · challenge còn hiệu lực sau khởi động lại máy chủ · replay bị từ chối – **ĐẠT**
- Hồi quy toàn bộ: đăng nhập 21 bước · sinh trắc 11 · gắn máy 8 · vân tay 11 · xác thực lại 8 · tài khoản 12 · màn đăng nhập 8 · lời chào 4 · giao diện/ngôn ngữ 9 · lỗi cũ 5 · Tối 5 · đọc ảnh 19 – **0 lỗi**

> Virtual authenticator **không phải bằng chứng** Face ID trên iPhone thật – xem §7 (chủ dự án tự kiểm).

## 6. Cấu hình Railway

Không bắt buộc thêm biến: app tự lấy `RAILWAY_PUBLIC_DOMAIN` làm RP ID / origin. Chỉ cần khi:

| Biến | Khi nào |
|---|---|
| `RP_ID` + `ORIGIN` | Dùng **tên miền riêng** (VD `so.example.vn` / `https://so.example.vn`). Đổi RP ID sau khi đã đăng ký → passkey cũ hết dùng được, phải bật lại |
| `RP_NAME` | Đổi tên hiện trong hộp thoại passkey (mặc định "Sổ Cá Nhân") |
| `BIO_BIND=0` | Muốn passkey đồng bộ iCloud / Google đăng nhập trên mọi máy (mặc định: gắn máy) |
| `CHALLENGE_TTL_SEC` | Đổi hạn challenge (mặc định 300) |

Lưu ý: máy chủ đọc `ALLOW_ORIGIN` (để trống = chặn mọi trang khác gọi API – khuyên dùng). Biến `ALLOWED_ORIGINS` không được đọc.

## 7. Kiểm tra trên iPhone thật (chủ dự án thực hiện)

1. Safari mở `https://<tên-miền-railway>` → đăng nhập mật khẩu → 👤 Tài khoản → **Bật cho máy này** → hộp thoại hệ thống hiện → Face ID / Touch ID (hoặc mật mã máy).
2. Chia sẻ → **Thêm vào MH chính** → mở từ biểu tượng (chế độ standalone).
3. Khoá app (👤 › Khoá ngay) → bấm biểu tượng Face ID → vào app không nhập mật khẩu.
4. Đăng xuất (không xoá dữ liệu) → màn đăng nhập → bấm biểu tượng → vào app.
5. Huỷ hộp thoại Face ID → app báo "Không xác thực được…", vẫn đăng nhập bằng mật khẩu được.
6. Bật Chế độ máy bay → khoá app → mở bằng Face ID (kiểm chữ ký trên máy).
7. iPad / Mac cùng iCloud: bấm biểu tượng → **bị từ chối** (gắn máy) → đăng nhập mật khẩu rồi bật riêng cho máy đó.
8. 👤 Tài khoản: thấy danh sách passkey, đổi tên (✏️), xoá; xoá xong máy đó không dùng Face ID được nữa.

Ghi kết quả từng bước; báo lại nếu bước nào khác mô tả.

## 8. Rollback

- Nhanh: Railway › Deployments › bản trước (1.14.x) › **Redeploy**.
- Hoặc nhánh `phien-ban/v1.14.3`.
- Dữ liệu an toàn khi rollback: cột `user_handle` và bảng `scn_challenge` thừa không ảnh hưởng bản cũ; passkey đã đăng ký vẫn đăng nhập được ở bản cũ (bản cũ không kiểm user handle).

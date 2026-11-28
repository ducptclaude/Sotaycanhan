# Các phiên bản Sổ Cá Nhân & cách quay lại bản cũ (rollback)

Mỗi phiên bản là một **nhánh cố định** `phien-ban/vX.Y.Z` trên GitHub, trỏ đúng commit đã kiểm tra và triển khai. Không sửa các nhánh này. Bản đang chạy trên Railway luôn là nhánh `main`.

> Ghi chú: phiên làm việc với Claude chỉ được tạo nhánh, không tạo được *tag / Release* trên GitHub (chính sách quyền). Muốn có tag, bạn tự tạo trên GitHub: **Releases → Draft a new release → Choose a tag** (gõ `v1.13.1`) → **Target**: chọn nhánh `phien-ban/v1.13.1` → **Publish**.

| Phiên bản | Ngày | Commit | Nội dung | Tải về |
|---|---|---|---|---|
| **v1.16.1** | 2026-11-28 | `5a71f33` | Bảng Thông báo khi bấm 🔔 (như app khác): nhắc nhở, cần chú ý, lịch sử hoạt động | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.16.1) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.16.1.zip) |
| **v1.16.0** | 2026-11-28 | `2073269` | Giao diện 3 phong cách (Light Premium · Light Analytics · Dark Digital) + Sáng/Tối/Theo máy, dashboard số liệu thật, ảnh đại diện | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.16.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.16.0.zip) |
| **v1.15.0** | 2026-11-28 | `d92ce86` | Passkey Face ID / Touch ID + lời chào + nền Tối theo mục | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.15.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.15.0.zip) |
| **v1.14.3** | 2026-11-28 | `61086fc` | Lời chào đúng tên, bỏ dòng thừa, nền Tối digital theo từng mục | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.14.3) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.14.3.zip) |
| **v1.14.2** | 2026-11-28 | `9cfda15` | Màn Quên mật khẩu gọn | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.14.2) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.14.2.zip) |
| **v1.14.1** | 2026-11-28 | `b198cf9` | Quên mật khẩu dùng BACKUP_TOKEN | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.14.1) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.14.1.zip) |
| **v1.14.0** | 2026-11-28 | `a2cc483` | Màn đăng nhập kiểu ngân hàng + Họ tên + nền Tối digital | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.14.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.14.0.zip) |
| **v1.13.5** | 2026-11-26 | `68e111f` | Nền giao diện Tối kiểu digital – electric – finance | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.13.5) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.13.5.zip) |
| **v1.13.4** | 2026-11-26 | `54b5947` | Giao diện Tối dùng màu Binance | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.13.4) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.13.4.zip) |
| **v1.13.3** | 2026-11-26 | `1ac233e` | Cờ quốc gia SVG cho nút ngôn ngữ | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.13.3) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.13.3.zip) |
| **v1.13.2** | 2026-11-26 | `5ae5d56` | Giao diện tối xám than + Binance | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.13.2) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.13.2.zip) |
| **v1.13.1** | 2026-11-25 | `da0d9b0` | Sửa ngôn ngữ & màu giao diện tối | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.13.1) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.13.1.zip) |
| **v1.13.0** | 2026-11-25 | `a1044e9` | Giao diện Sáng/Tối + Tiếng Việt/English | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.13.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.13.0.zip) |
| **v1.12.2** | 2026-11-25 | `933f38f` | Đọc ảnh nghiêng + xác nhận số tiền chưa chắc | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.12.2) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.12.2.zip) |
| **v1.12.1** | 2026-11-25 | `01a0747` | Sửa đọc ảnh giao dịch | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.12.1) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.12.1.zip) |
| **v1.12.0** | 2026-11-24 | `5e26aaf` | Face ID / vân tay trên điện thoại – khoá gắn máy | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.12.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.12.0.zip) |
| **v1.11.3** | 2026-11-24 | `764c8e2` | Sửa icon cũ khi thêm vào màn hình chính | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.11.3) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.11.3.zip) |
| **v1.11.2** | 2026-11-24 | `8455b9b` | Logo mới bản 2 | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.11.2) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.11.2.zip) |
| **v1.11.1** | 2026-11-24 | `730d6cc` | Logo mới cho app | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.11.1) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.11.1.zip) |
| **v1.11.0** | 2026-11-24 | `12b541a` | Sinh trắc thiết bị + xác thực lại + giao diện đăng nhập mới | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.11.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.11.0.zip) |
| **v1.10.0** | 2026-11-24 | `f4c9982` | Xác thực lại bằng sinh trắc cho thao tác nhạy cảm + nhận diện AAGUID | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.10.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.10.0.zip) |
| **v1.9.0** | 2026-11-24 | `0455d73` | Sinh trắc thiết bị: không passkey đồng bộ, không cá nhân hoá, CSDL riêng | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.9.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.9.0.zip) |
| **v1.8.0** | 2026-11-24 | `243129a` | Ảnh giao dịch tự đọc số tiền + gõ nhanh | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.8.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.8.0.zip) |
| **v1.7.0** | 2026-11-24 | `2195fd3` | Thông báo biến động kiểu tin nhắn ngân hàng | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.7.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.7.0.zip) |
| **v1.6.0** | 2026-11-24 | `b27ceb8` | Trang Tài khoản, rà soát bảo mật, sửa vân tay | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.6.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.6.0.zip) |
| **v1.5.0** | 2026-11-23 | `b99b6ed` | Đăng nhập tài khoản chủ, vân tay/Face ID, khoá app | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.5.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.5.0.zip) |
| **v1.4.0** | 2026-11-23 | `4bf078d` | Đồng bộ tức thời, Postgres, thông báo đẩy, sao lưu GitHub, lịch sử giao dịch | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.4.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.4.0.zip) |
| **v1.3.1** | 2026-11-23 | `de2ad0e` | Thêm nút đồng bộ nhanh trên nút + | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.3.1) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.3.1.zip) |
| **v1.3.0** | 2026-11-23 | `08de412` | Tách khỏi Claude, đồng bộ qua máy chủ Railway | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.3.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.3.0.zip) |
| **v1.2.0** | 2026-11-23 | `fe59f14` | Máy chủ gộp app + đồng bộ cho Railway | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.2.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.2.0.zip) |
| **v1.1.0** | 2026-11-23 | `62955c0` | Đồng bộ qua máy chủ bằng Service Worker | [code](https://github.com/ducptclaude/Sotaycanhan/tree/phien-ban/v1.1.0) · [.zip](https://github.com/ducptclaude/Sotaycanhan/archive/refs/heads/phien-ban/v1.1.0.zip) |

*1.9.0 và 1.10.0 được gộp vào `main` cùng 1.11.0; 1.13.5 cùng 1.14.0; 1.14.3 cùng 1.15.0; ảnh đại diện (PR #28) cùng 1.16.0; 1.1.0 là bản đầu tiên. Bản đang chạy trên Railway: **v1.16.1**.*

## Cách rollback

### Cách 1 – Nhanh nhất, trên Railway (không đụng code) – khuyên dùng khi bản mới lỗi
1. Railway → dịch vụ **sotaycanhan** → tab **Deployments**.
2. Tìm bản triển khai cũ đang chạy tốt (xem thời gian / tiêu đề commit) → bấm **⋮** → **Redeploy**.
3. Chờ ~1 phút → mở `https://sotaycanhan-production.up.railway.app/health` kiểm tra `"ver"`.

Lưu ý: lần sau gộp code mới vào `main`, Railway sẽ tự triển khai bản mới nhất trở lại.

### Cách 2 – Đưa `main` về đúng một phiên bản (lâu dài)
Nhờ Claude (hoặc tự làm trên GitHub): tạo Pull Request **từ** nhánh `phien-ban/vX.Y.Z` **vào** `main` bằng thao tác *revert* các lần gộp sau phiên bản đó, rồi gộp → Railway tự triển khai lại bản đó. Câu nhắn mẫu cho Claude: *"rollback main về v1.12.2"*.

### Cách 3 – Chạy bản cũ trên máy tính
Tải `.zip` của phiên bản ở bảng trên → giải nén → `npm install` → `node server.js` (xem HUONG-DAN.md).

## Dữ liệu có bị ảnh hưởng khi rollback không?
- Dữ liệu nằm trong **Postgres** (Railway) và trên từng thiết bị – rollback code **không xoá dữ liệu**.
- Quay về bản **trước 1.15.0**: passkey đăng ký ở 1.15.0 vẫn dùng được (bản cũ chỉ bỏ qua kiểm tra user handle); bảng `scn_challenge`, cột `user_handle` thừa không ảnh hưởng.
- Quay về bản **trước 1.14.1**: Quên mật khẩu dùng lại `SYNC_TOKEN` thay vì `BACKUP_TOKEN`.
- Quay về bản **trước 1.12.0**: khoá Face ID / vân tay gắn máy trên điện thoại sẽ không dùng được (bản cũ không hiểu mã gắn máy) → đăng nhập bằng mật khẩu. Quay lại bản mới thì dùng lại bình thường.
- Quay về bản **trước 1.5.0**: chưa có đăng nhập tài khoản – không khuyên dùng.
- Trên điện thoại, mở app 1–2 lần để Service Worker nhận đúng phiên bản (chân màn đăng nhập hiện `v…`).

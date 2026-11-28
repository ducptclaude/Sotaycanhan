# Giao diện 3 phong cách – bàn giao triển khai (bản 1.16.0)

Triển khai theo `README_DASHBOARD_UI.md` và 3 ảnh tham chiếu. **Không viết lại app, không đổi API / CSDL / máy chủ / đăng nhập / passkey.** Chỉ sửa giao diện (`index.html`), bản dịch và số phiên bản.

## 1. Chọn giao diện

⚙️ Ứng dụng & dữ liệu (bấm ô trạng thái góc phải) hoặc 👤 Tài khoản → **🖼️ Phong cách** + **🎨 Chế độ**.

| Phong cách | Bố cục | Chế độ gợi ý |
|---|---|---|
| **A · Light Premium** | Lời chào lớn + sóng teal, dải Hôm nay / Tuần này / Tiến độ chung, 5 thẻ mảng (Tài chính navy, Sức khỏe teal), tài chính + sức khỏe + công việc | Sáng |
| **B · Light Analytics** (mặc định) | Lời chào + hàng chip mục, Tổng quan tuần + Việc ưu tiên, thẻ Tài chính rộng (thu, chi, tiết kiệm, tỷ lệ, biểu đồ 6 tháng, cơ cấu chi, mục tiêu tiết kiệm), Sức khỏe, Học tập, Mục tiêu | Sáng |
| **C · Dark Digital** | Lời chào trên nền núi mờ, 5 thẻ viền teal, Tổng quan tuần (thanh + vòng Hiệu suất), Việc cần làm | Tối Navy–Teal |

- Chọn phong cách → đổi bố cục **và** đặt chế độ gợi ý; sau đó vẫn đổi riêng **Sáng / Tối / Theo máy**.
- **Theo máy** đổi ngay khi điện thoại/máy tính chuyển sáng ↔ tối.
- Chế độ **Tối** của cả 3 phong cách dùng bộ màu **Navy–Teal** (thay bộ Binance của bản 1.13–1.15), kèm nền digital mờ theo từng mục.
- Lưu trên từng máy (`localStorage`: `scn-ui`, `scn-theme`) – không lưu token hay dữ liệu cá nhân. Màu được áp **trước khi vẽ trang** → không nháy sai màu.
- Mặc định máy chưa chọn: **B + Theo máy**. Máy đã chọn Sáng/Tối từ bản cũ: giữ nguyên.

## 2. Số liệu – chỉ dùng dữ liệu thật

| Khối | Công thức |
|---|---|
| Tài chính | Thu, chi, tiết kiệm = thu − chi, tỷ lệ = tiết kiệm / thu – theo kỳ chọn (Tháng này / Tháng trước / Từ đầu năm); biểu đồ thu–chi 6 tháng; cơ cấu chi theo danh mục; vòng **chi / thu**; mục tiêu tiết kiệm = mục tiêu lĩnh vực Tài chính đầu tiên |
| Sức khỏe | Vòng = số ngày đã ghi chỉ số tuần này; bước chân, ngủ TB 7 ngày, nước, cân nặng, huyết áp gần nhất |
| Học tập | Phút học tuần này / mục tiêu phút tuần (đã đặt ở Học tập), chuỗi ngày học, thẻ cần ôn, tuần lộ trình tiếng Anh |
| Kế hoạch | Việc đến hạn hôm nay + quá hạn; ô đánh dấu **lưu thật** (đồng bộ như bình thường) |
| Mục tiêu | Tiến độ từng mục tiêu đang theo đuổi |
| Tổng quan tuần | Kế hoạch = việc đến hạn tuần đã xong / tổng · Thói quen = tỷ lệ hoàn thành tuần · Học tập = phút / mục tiêu · Sức khỏe = ngày đã ghi / số ngày đã qua · Mục tiêu = tiến độ TB. **Tiến độ chung** = trung bình các mảng có dữ liệu (mảng chưa có dữ liệu bị bỏ, không tự suy diễn) |

Mục chưa có dữ liệu hiện **"Chưa có…"** + nút **+ Nhập** mở đúng biểu mẫu sẵn có. Không có số liệu, tên, ngày, thời tiết minh hoạ.

Giữ toàn bộ khối cũ của Trang chủ: Lịch hôm nay / ngày mai, Cần chú ý, Đánh dấu thói quen, Nhịp hôm nay.

## 3. Khung app

- **iPhone / máy tính bảng**: thanh đáy 5 mục **Trang chủ · Tài chính · Sức khỏe · Học tập · Khác** (Khác = Lịch, Kế hoạch, Mục tiêu, Thói quen, Ghi chép, Danh bạ, Tổng kết tháng, Tài khoản). Vùng chạm ≥ 44 px, tôn trọng vùng an toàn (safe area).
- **Máy tính ≥ 1024 px**: thanh điều hướng bên trái 248 px (logo + 7 mục), nội dung tối đa 1200 px, lưới 12 cột.
- Tiêu đề: logo, 🔔 Nhắc nhở (số mục cần chú ý, mở trang Nhắc nhở), nút tài khoản = **ảnh đại diện** (tính năng PR #28) → nếu chưa có ảnh: chữ cái đầu tên.
- Không thêm nút tìm kiếm / thời tiết / chọn ngày như ảnh mẫu vì app chưa có chức năng tương ứng (không tạo nút chết).

## 4. Khác ảnh tham chiếu & lý do

| Ảnh mẫu | Trong app | Lý do |
|---|---|---|
| "Sổ Tay Cá Nhân", tên Nguyễn Minh Quân, ngày 2025, 27°C Hà Nội | Tên app thật, Họ tên từ 👤 Tài khoản, ngày hôm nay | Không hardcode dữ liệu mockup |
| Giờ 09:00 – 10:00 ở việc cần làm | Không có giờ | Việc cần làm chưa có trường giờ (không đổi CSDL) |
| Vòng bước chân 8.420 / kcal / km | Vòng ngày đã ghi + chỉ số thật | App không có mục tiêu bước chân, kcal, km |
| Thanh đáy 6 mục (A, B) | 5 mục + Khác | Theo README §5 (tối đa 5 mục chính) |
| Ba cột tài chính cạnh nhau (B) | Xếp dọc trên iPhone, 3 vùng trên máy tính | README §2-B |

## 5. Kiểm thử (đã chạy – `kiem-tra/ket-qua-v1.16-giao-dien.txt`)

- Mới – giao diện 1.16: **17/17 đạt** (ảnh đại diện trên thanh tiêu đề + màn khoá, mặc định B + Theo máy, trạng thái trống, chọn phong cách, đổi chế độ riêng, Theo máy, lưu qua tải lại + không nháy, đánh dấu việc lưu thật, số liệu tài chính đúng, đổi kỳ, 5 mục + Khác, thanh bên máy tính, không cuộn ngang ở 320/375/390/430/768/1024/1440 × 3 phong cách, màn khoá che số liệu, vùng chạm ≥ 44 px).
- Hồi quy (không lỗi): đăng nhập 21 bước · sinh trắc 11 · gắn máy 8 · vân tay 11 · xác thực lại 8 · tài khoản 12 · màn đăng nhập 8 · lời chào 4 · mã khôi phục 8 · giao diện/ngôn ngữ 9 · lỗi cũ 5 · Tối Navy 5 · đọc ảnh 19 · passkey A 10, B 6, D 2.
- English: mọi chữ mới đã có bản dịch (+98 mục trong `assets/i18n-en.json`).
- Ảnh: `kiem-tra/v1.16/` – so sánh với ảnh mẫu, iPhone 390×844, máy tính 1440×900, bộ chọn phong cách (dữ liệu **mẫu**, không phải dữ liệu thật).

> Ảnh giả lập không thay cho kiểm tra trên iPhone thật – xem §6.

## 6. Kiểm tra trên iPhone thật (sau khi triển khai)

1. Safari mở app → ⚙️ → chọn lần lượt A, B, C: bố cục và màu đổi ngay, không phải tải lại.
2. Chọn **Theo máy** → Cài đặt iPhone › Màn hình & Độ sáng đổi Sáng/Tối → app đổi theo.
3. Đóng hẳn app, mở lại từ biểu tượng màn hình chính → giữ đúng phong cách, không nháy màu.
4. Thanh đáy không che nội dung cuối trang; nút + không che ô đánh dấu khi cuộn hết.
5. Bấm ô đánh dấu việc hôm nay → mở trên máy khác thấy đã đồng bộ.
6. Khoá app (👤 › Khoá ngay) → không thấy số dư; mở bằng Face ID như cũ.
7. Xoay ngang iPad / mở trên máy tính → thanh điều hướng bên trái.

## 7. Railway & rollback

- **Không cần thêm biến môi trường**, không có dependency mới, không đổi CSDL.
- Rollback: Railway › Deployments › bản 1.15.0 › Redeploy, hoặc nhánh `phien-ban/v1.15.0`. Lựa chọn `scn-ui` thừa không ảnh hưởng bản cũ.

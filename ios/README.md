# Sổ Cá Nhân trên iPhone

App iOS dùng lại giao diện HTTPS của Sổ Cá Nhân trong WKWebView. Đăng nhập bằng sinh trắc dùng khóa P-256 riêng trong Secure Enclave, với quyền ký giới hạn cho bộ Face ID hoặc Touch ID hiện tại. Khóa riêng không rời thiết bị. Máy chủ lưu khóa công khai và kiểm chữ ký trên thử thách ngắn hạn, dùng một lần. Luồng iOS không dùng WebAuthn, iCloud Passwords hay tự điền mật khẩu. Máy chủ xác minh quyền sở hữu khóa đã đăng ký. Phiên bản này chưa có xác thực phần cứng từ xa bằng App Attest.

## Chạy thử bằng Xcode

1. Cần máy Mac có Xcode, XcodeGen và iPhone thật chạy iOS 16 trở lên. Đăng ký sẵn Face ID hoặc Touch ID trên iPhone.
2. Phục vụ mã giao diện và backend từ nhánh này trên cùng một địa chỉ HTTPS dành cho kiểm thử.
3. Trong thư mục `ios`, chạy `xcodegen generate` rồi mở `Sotaycanhan.xcodeproj`. Trong target **Sotaycanhan**, đặt `SOTAYCANHAN_URL` thành địa chỉ HTTPS ở bước 2 và chọn Apple Development Team trong **Signing & Capabilities**. Nếu Xcode yêu cầu, đổi bundle identifier thành mã thuộc đội ký của bạn.
4. Chọn iPhone làm thiết bị chạy rồi **Run**. Lần đầu đăng nhập bằng mật khẩu Sổ Cá Nhân, vào **Tài khoản → Bật cho máy này** và xác thực bằng Face ID hoặc Touch ID.
5. Chọn **Đăng xuất khỏi máy này**, sau đó bấm biểu tượng sinh trắc để đăng nhập lại. Thử hủy hộp thoại, chọn **Khóa ngay**, và thu hồi khóa trong **Tài khoản**. Kiểm tra trường hợp đổi bộ sinh trắc trên iPhone, sau đó đăng nhập bằng mật khẩu, thu hồi khóa cũ và đăng ký lại.

Đăng nhập và mở khóa sinh trắc trong bản iOS này cần kết nối với máy chủ. Safari và PWA tiếp tục dùng luồng web hiện có.

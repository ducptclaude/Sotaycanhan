# Sao lưu Sổ Cá Nhân

Nhánh tự động – mỗi tuần một bản sao lưu **đã mã hoá** (AES-256-GCM).

- `danh-muc.json`: danh sách bản sao, mã băm SHA-256 và chuỗi băm để kiểm tra toàn vẹn.
- Giải mã / kiểm tra: `node server/kiem-tra-sao-luu.js` (xem hướng dẫn trong nhánh main).

# Máy chủ đồng bộ (tuỳ chọn)

> Muốn **app + đồng bộ trên cùng một địa chỉ** (VD Railway): dùng `server.js` ở thư mục gốc – xem mục 1b trong `HUONG-DAN.md`. Tệp `sync-server.js` ở đây chỉ chạy phần đồng bộ.

Chỉ cần khi muốn dùng **chung dữ liệu trên nhiều thiết bị**. Không có máy chủ, ứng dụng vẫn chạy đầy đủ và lưu dữ liệu trên từng máy.

```bash
SYNC_TOKEN=dat-mot-ma-bi-mat-dai PORT=8787 node sync-server.js
```

- Yêu cầu Node.js 18 trở lên, không cần cài thêm thư viện.
- Dữ liệu lưu trong `data.json` cạnh tệp. Nhớ sao lưu tệp này định kỳ.
- Phải chạy sau **HTTPS**, vì trang HTTPS không gọi được máy chủ HTTP. Có thể dùng Render, Railway, Fly.io, VPS + Caddy/Nginx…
- Trong app, bấm nút trạng thái ở góc trên → **Máy chủ đồng bộ** → nhập địa chỉ + mã `SYNC_TOKEN` → **Lưu & đồng bộ**.
- Khi hai máy cùng sửa một mục, bản sửa sau cùng được giữ (last-write-wins).
- Nếu tệp dữ liệu bị xoá/tạo mới, máy chủ báo `reset` và các thiết bị tự gửi lại toàn bộ dữ liệu (kể cả mục đã xoá).

# Local AI Translator — Chrome Extension

Dịch và giải thích văn bản bằng mô hình AI cục bộ (llama.cpp), giao diện theo phong cách Google Translate.

---

## Cài đặt

### 1. Cấu hình port llama.cpp

Mở `src/config.js` và chỉnh `PORT` theo server của bạn:

```js
PORT: 8080,   // ← đổi thành port của bạn
```

Giá trị mặc định dùng port **8080**.  
Bạn cũng có thể thay đổi port trực tiếp trong popup của extension sau khi cài.

### 2. Khởi động llama-server

```bash
# Ví dụ: chạy với CORS được bật
llama-server.exe -m your-model.gguf --port 8080 --cors
```

Nếu gặp lỗi CORS, hãy thêm flag `--cors` vào lệnh khởi động.

### 3. Cài extension vào Chrome

1. Mở Chrome → `chrome://extensions`
2. Bật **Developer mode** (góc trên phải)
3. Nhấn **Load unpacked**
4. Chọn thư mục `extension-root`

---

## Sử dụng

### Cách 1 — Floating icon (chính)
1. Bôi đen bất kỳ đoạn văn bản nào trên trang web
2. Biểu tượng dịch xuất hiện gần con trỏ
3. Nhấn vào biểu tượng → kết quả hiện trong bubble

### Cách 2 — Context menu
1. Bôi đen văn bản
2. Chuột phải → **Dịch / Giải thích bằng AI**

### Cách 3 — Popup thủ công
1. Nhấn icon extension trên toolbar
2. Dán văn bản vào ô nhập
3. Nhấn **Dịch / Giải thích** hoặc `Ctrl+Enter`

---

## Chế độ dịch

| Chế độ | Kích hoạt khi | Kết quả |
|--------|--------------|---------|
| **Dịch thuật** | Văn bản < 30 từ | Bản dịch trực tiếp sang tiếng Việt |
| **Phân tích** | Văn bản ≥ 30 từ | Tóm tắt + Từ vựng quan trọng + Dịch đầy đủ |

Ngưỡng 30 từ có thể chỉnh trong `src/config.js` (DUAL_MODE_THRESHOLD) hoặc trong popup.

---

## Cấu trúc file

```
extension-root/
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── config.js       ← Cài đặt chính (PORT, ngưỡng, ngôn ngữ)
    ├── background.js   ← Service worker, gọi API llama.cpp
    ├── content.js      ← Phát hiện bôi chữ, hiển thị UI trên trang
    ├── styles.css      ← Toàn bộ CSS
    ├── popup.html      ← Cửa sổ dịch thủ công
    └── popup.js        ← Logic popup
```

---

## Ghi chú

- Extension **không gửi dữ liệu ra ngoài** — toàn bộ xử lý qua `localhost`
- Cần thêm file icon thực (PNG) vào thư mục `icons/` trước khi cài
- Để tạo icon nhanh, bạn có thể dùng bất kỳ ảnh PNG 16×16, 48×48, 128×128

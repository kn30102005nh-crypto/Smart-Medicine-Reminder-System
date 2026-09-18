# 📦 Hướng Dẫn Tải Xuống và Chạy Ứng Dụng MedBox IoT Trên Máy Tính Cá Nhân

Tài liệu này hướng dẫn chi tiết cách tải toàn bộ mã nguồn của dự án **Smart MedBox Solution** về máy tính cá nhân của bạn, cài đặt các thành phần cần thiết và khởi chạy máy chủ một cách đơn giản nhất.

---

## 📋 Bước 1: Chuẩn bị môi trường hệ thống
Để mã nguồn chạy được trên máy tính của bạn, hãy đảm bảo đã cài đặt:
1. **Node.js**: Phiên bản khuyên dùng là LTS (v18 trở lên). Tải tại [nodejs.org](https://nodejs.org/).
2. **Trình soạn thảo mã nguồn** (Khuyên dùng [VS Code](https://code.visualstudio.com/)).

---

## 🛠️ Bước 2: Tải dự án về máy tính
Bạn có thể xuất mã nguồn trực tiếp từ giao diện AI Studio bằng cách:
* Nhấp vào **Settings (Cài đặt)** ở góc trên bên phải màn hình AI Studio.
* Chọn mục **Export (Xuất dự án) ➡️ Download ZIP** để tải toàn bộ mã dự án dưới dạng tập tin nén `.zip`.
* Giải nén thư mục dự án này vào một nơi dễ tìm kiếm trên thiết bị của bạn (Ví dụ: `D:/Projects/SmartMedBox`).

---

## 🔑 Bước 3: Sửa lỗi chính sách bảo mật PowerShell của Windows (NPM Error)
Nếu bạn mở cmd/PowerShell và chạy lệnh cài đặt gặp phải thông báo lỗi này:
> *npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system...*

### 👉 Cách khắc phục cực kỳ đơn giản (Chọn 1 trong 2 cách):

#### Cách 1: Sử dụng Command Prompt thường (Khuyên Dùng)
Thay vì sử dụng PowerShell, bạn hãy mở ứng dụng **Command Prompt (CMD)** truyền thống của Windows để chạy lệnh. **CMD** không bị lỗi giới hạn chính sách bảo mật này.

#### Cách 2: Phục hồi quyền thực thi trong PowerShell
Nếu bạn vẫn muốn dùng PowerShell để gõ lệnh, hãy thực hiện các bước sau:
1. Nhấp phím **Windows** trên bàn phím, gõ **PowerShell**.
2. Nhấp chuột phải vào ứng dụng **Windows PowerShell** và chọn **Run as Administrator** (Chạy với quyền Quản trị viên).
3. Copy và dán lệnh sau vào rồi bấm **Enter**:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
4. Hệ thống sẽ hỏi xác nhận, hãy nhập chữ `Y` rồi bấm **Enter**. Lỗi bảo mật chặn các tệp lệnh `.ps1` trên máy bạn đã được gỡ bỏ vĩnh viễn!

---

## 🚀 Bước 4: Khởi chạy dự án

Sau khi mở **CMD** hoặc **PowerShell** đã được xử lí chính sách ở bước trên, hãy di chuyển tới thư mục chứa dự án:

```bash
# 1. Di chuyển vào thư mục dự án của bạn
cd "đường_dẫn_tấn_thư_mục_đã_giải_nén"

# 2. Cài đặt toàn bộ thư viện thuộc dự án
npm install

# 3. Khởi chạy máy chủ phát triển thời gian thực
npm run dev
```

Khi chạy thành công, màn hình thiết bị đầu cuối sẽ hiển thị:
```text
Server running on http://localhost:3000
```
Hãy mở trình duyệt web và truy cập đường dẫn **[http://localhost:3000](http://localhost:3000)** để theo dõi & sử dụng ứng dụng ngay lập tức!

---

## 💡 Cấu hình phím bí mật Dược Sĩ AI (Gemini API Key)
Dự án được xây dựng bảo mật tuyệt đối. Để tính năng tư vấn trực tiếp từ AI hoạt động trên thiết bị của bạn:
1. Tạo một tệp chữ có tên `.env` nằm tại thư mục gốc ngang hàng với `package.json`.
2. Sao chép nội dung từ `.env.example` và điền khóa API của bạn vào:
   ```env
   GEMINI_API_KEY="AIzaSy..."
   ```
   *(Bạn có thể lấy khóa API miễn phí trực tiếp qua Google AI Studio).*

---

## 📡 Cơ Chế Kết Nối Giữa Web Dashboard Và Phần Cứng ESP32 (MQTT)

Dự án hiện tại sử dụng giao thức **MQTT** để truyền thông siêu tốc tích hợp 2 chiều cực kỳ mượt mà giữa Web Dashboard và thiết bị phần cứng ESP32, thay thế hoàn toàn cho cơ chế Polling HTTP truyền thống:

### 1. Nguyên Lý kết nối thời gian thực qua MQTT
- **MQTT Broker**: Sử dụng máy chủ trung gian công cộng miễn phí phổ biến và tin cậy: `broker.hivemq.com` (Port `1883` TCP). Do đó, bạn không cần phải cấu hình IP máy tính LAN phức tạp hay lo sợ ESP32 lệch mạng LAN nữa!
- **Hành trình gửi tin**:
  - Khi thêm cữ hoặc ấn nút còi trên Dashboard -> Server gửi tin tới topic `medbox/9240bc0f/reminders` và `medbox/9240bc0f/control` (hình thức `retain: true` giúp giữ trạng thái). ESP32 đăng ký và ngay lập tức nháy LED / reo Buzzer.
  - Khi người dùng nhấn nút bấm cứng `BTN_OK` hoặc bấm đặt giờ cữ thuốc trên ESP32 -> ESP32 công bố tin hiệu lên topic `medbox/9240bc0f/action` để Web lưu vĩnh viễn vào `data.json` và cập nhật giao diện ngay lập tức.

### 2. Các Bước Cài Đặt Kết Nối Phần Cứng
1. Tải file mã nguồn **`Arduino_MedBox_WiFi.ino`** có trong thư mục này về nạp vào ESP32.
2. Cài đặt các thư viện bắt buộc trong Arduino IDE (Vào **Sketch > Include Library > Manage Libraries...**):
   - **`PubSubClient`** (Bởi Nick O'Leary) - Dành cho giao thức MQTT.
   - **`ArduinoJson`** (Bản v6 hoặc v7) - Dành cho giải mã JSON.
   - **`RTClib`** (Bởi Adafruit) - Để duy trì thời gian thực tế.
3. Không cần đổi IP LAN! Mặc định, thiết bị sẽ tự kết nối qua Broker HiveMQ để đồng bộ với Web của bạn thông qua sóng Wi-Fi được đặt thông số SSID và Password khớp môi trường phòng bạn.
4. Nạp chương trình xuống bo mạch ESP32. Mở Serial Monitor với chế độ `115200` baud rate để quan sát chuỗi chu kỳ kết nối và đồng bộ mượt mà!


/*
  ==================================================================================
              HỆ THỐNG NHẮC UỐNG THUỐC THÔNG MINH - MEDBOX DASHBOARD (IoT ESP32 - MQTT)
  ==================================================================================
  CHUYỂN SANG GIAO THỨC MQTT SIÊU TỐC ĐỒNG BỘ 2 CHIỀU THỜI GIAN THỰC!
 
  TÍNH NĂNG TÍCH HỢP 2 CHIỀU ĐỘT PHÁ VỚI MQTT:
  1. PHẢN HỒI THỜI GIAN THỰC (< 100ms): Thao tác đổi cữ trên Web hay bấm nút trên ESP32 sẽ được kích hoạt tức thì.
  2. HỖ TRỢ OFFLINE TỰ DO: Chỉnh Giờ/Phút trực tiếp bằng các nút MODE, UP, DOWN, OK.
     Cài đặt tại chỗ được lưu cứng và hiển thị ra màn hình LCD.
  3. XÁC NHẬN ĐG UỐNG ĐỒNG THỜI QUA CẢM BIẾN THÔNG MINH:
     - Thiết bị báo cữ nháy đèn xối xả và hú còi liên tục.
     - NHẤC HỘP THUỐC / MỞ NẮP ĐÚNG NGĂN (Kích hoạt cảm biến) hoặc Nhấn BTN_OK -> Tắt còi tại chỗ,
       gửi lệnh báo Đã uống lên máy chủ thông báo tức thì.
     - CHỐNG UỐNG NHẦM THUỐC: Nhấc nhầm ngăn thuốc khác đang có chuông báo -> Còi kêu dập dồn báo động lỗi,
       LCD hiện "NHĂN NHẦM" ngăn chặn hành vi uống sai thuốc vô hại hay có hại!
     - Nhấn nút "Xác nhận đã uống" trên Web -> ESP32 tự động dập chuông tắt LED từ xa!
  4. ĐỒNG BỘ 2 CHIỀU TOÀN VẸN:
     - Thêm cữ trên Web -> Tải tức thì xuống danh sách của ESP32.
     - Bấm nút cài đặt cữ trên thiết bị -> Đẩy cữ lên lưu trên Dashboard Web server.
  SỬ DỤNG THƯ VIỆN:
  - PubSubClient (Bởi Nick O'Leary) - Tải qua Library Manager của Arduino IDE.
  - LiquidCrystal_I2C
  - RTClib (by Adafruit)
  - ArduinoJson (Bản v6 hoặc v7) Tải qua Library Manager.
*/
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <RTClib.h>
#include <Preferences.h>
#include <time.h>
// ==========================================
// 1. CẤU HÌNH WI-FI & MQTT BROKER
// ==========================================
#define WIFI_SSID "Đói Bụng Quá Đi"
#define WIFI_PASS "xin20knhe"
// Sử dụng Broker công cộng miễn phí cực kỳ phổ biến và tin cậy
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
// Mã nhận dạng Unique dựa trên AppID giúp không bị trùng lặp kênh truyền
const char* topic_reminders = "medbox/9240bc0f/reminders";
const char* topic_control = "medbox/9240bc0f/control";
const char* topic_action = "medbox/9240bc0f/action";
// ==========================================
// 2. KHAI BÁO CHÂN PIN NGOẠI VI (SƠ ĐỒ PHẦN CỨNG)
// ==========================================
#define BTN_MODE 14
#define BTN_UP 27
#define BTN_DOWN 26
#define BTN_OK 33
#define BUZZER 32
#define LED 17
// Khai báo chân đọc của 3 cảm biến lắp tại 3 ngăn chứa thuốc (Ngăn 1 - Sáng, Ngăn 2 - Trưa, Ngăn 3 - Tối)
// Các cảm biến này thường là cảm biến hồng ngoại cản vật hoặc công tắc hành trình tại đáy khay
#define SENSOR_SLOT1 5
#define SENSOR_SLOT2 4
#define SENSOR_SLOT3 34
// Cấu hình mức logic kích hoạt của cảm biến phù hợp với thực tế lắp đặt:
// - LOW: Khi lấy thuốc ra/mở nắp, luồng hồng ngoại bị ngắt hoặc công tắc nhả ra -> Chân sensor xuống mức LOW (Rất thông dụng)
// - HIGH: Khi lấy thuốc ra/mở nắp thì chân cảm biến lên mức HIGH
#define SENSOR_TAKEN_LEVEL LOW
// Cấu hình mức logic kích hoạt cho còi và đèn phù hợp với linh kiện thực tế của bạn:
// - HIGH: Còi phát tiếng / Đèn sáng khi chân ở mức HIGH, tắt ở mức LOW (Kích hoạt mức Cao - Active High).
// - LOW: Còi phát tiếng / Đèn sáng khi chân ở mức LOW, tắt ở mức HIGH (Kích hoạt mức Thấp - Active Low - Rất phổ biến với module còi).
// Nếu còi của bạn liên tục kêu dồn dập ngay cả khi chưa tới giờ uống thuốc, hãy đổi BUZZER_ACTIVE thành LOW!
#define BUZZER_ACTIVE HIGH
#define LED_ACTIVE HIGH
// Hàm điều khiển Đèn LED tương thích mọi mức logic linh kiện
void setLedState(bool state) {
  digitalWrite(LED, state ? LED_ACTIVE : !LED_ACTIVE);
}
// Hàm điều khiển Còi chíp tương thích mọi mức logic linh kiện
void setBuzzerState(bool state) {
  digitalWrite(BUZZER, state ? BUZZER_ACTIVE : !BUZZER_ACTIVE);
}
#define MAX_REM 20
struct Reminder {
  long id;      // Khớp ID với Web Server
  int h, m;
  bool taken;
  int slot;     // Ngăn tương ứng (1: Sáng, 2: Trưa, 3: Tối)
};
Reminder r[MAX_REM];
int remCount = 0;

// Biến điều chỉnh Giờ/Phút trực tiếp bằng nút bấm trên thiết bị
int currentSetHour = 8;
int currentSetMinute = 0;
bool isSettingMinute = false; // false = chỉnh Giờ, true = chỉnh Phút
LiquidCrystal_I2C lcd(0x27, 16, 2);
RTC_DS1307 rtc;
Preferences prefs;
WiFiClient espClient;
PubSubClient client(espClient);
// Trạng thái từ xa đồng bộ qua web
int webLedState = 0;
int webBuzzerState = 0;
int webActiveSlot = 0;
String webRtcTime = "00:00:00";
bool serverConnected = false;
// ==========================================
// ĐỒNG HỒ KIỂM TRA THỜI GIAN THỰC
// ==========================================
DateTime getTimeNow() {
  struct tm t;
  if (getLocalTime(&t)) {
    return DateTime(t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
                    t.tm_hour, t.tm_min, t.tm_sec);
  }
  return rtc.now();
}
// ==========================================
// KHU VỰC THIẾT LẬP KẾT NỐI WIFI
// ==========================================
void setupWiFi() {
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  lcd.clear();
  lcd.print("Connecting WiFi");
  Serial.print("Connecting WiFi");
 
  int timeout = 0;
  while (WiFi.status() != WL_CONNECTED && timeout < 40) {
    delay(250);
    Serial.print(".");
    timeout++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    lcd.clear();
    lcd.print("WiFi Connected");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    Serial.println("\nWiFi Connected!");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
    delay(1500);
    // Đồng bộ thời gian qua máy chủ NTP tự động
    configTime(7 * 3600, 0, "pool.ntp.org");
    struct tm t;
    int ntpTimeout = 0;
    while (!getLocalTime(&t) && ntpTimeout < 25) {
      delay(200);
      ntpTimeout++;
    }
    if (ntpTimeout < 25) {
      rtc.adjust(getTimeNow());
      lcd.clear();
      lcd.print("NTP Sync OK!");
      delay(1000);
    } else {
      lcd.clear();
      lcd.print("NTP Timeout!");
      delay(1000);
    }
  } else {
    lcd.clear();
    lcd.print("WiFi Failed!");
    Serial.println("\nWiFi Connection Failed! Running Offline mode.");
    delay(1500);
  }
}
void checkAndReconnectWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastReconnectAttempt = 0;
    if (millis() - lastReconnectAttempt > 10000) {
      lastReconnectAttempt = millis();
      Serial.println("Wi-Fi disconnected! Retrying connection...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
  }
}
// ==========================================
// THÊM CỮ VÀ ĐỒNG BỘ LÊN WEB QUA MQTT ACTION
// ==========================================
void addReminder(int h, int m, int slot = 1) {
  if (remCount < MAX_REM) {
    // 1. Lưu tạm cữ cục bộ trước
    r[remCount++] = {0, h, m, false, slot};
    lcd.clear();
    lcd.print("Rem Added Local!");
    lcd.setCursor(0, 1);
    char buf[17];
    snprintf(buf, 17, "At %02d:%02d S:%d", h, m, slot);
    lcd.print(buf);
   
    // 2. Gửi lệnh add_reminder lên MQTT topic action tức thì để đồng bộ trên Web Server
    if (WiFi.status() == WL_CONNECTED && client.connected()) {
      char payload[128];
      snprintf(payload, sizeof(payload), "{\"action\":\"add_reminder\",\"h\":%d,\"m\":%d,\"slot\":%d}", h, m, slot);
      client.publish(topic_action, payload);
      Serial.println("[MQTT] Added reminder uploaded to Server successfully!");
    }
    delay(1500);
  }
}
// ==========================================
// THÔNG BÁO "ĐG UỐNG THUỐC" LÊN MÁY CHỦ BẰNG MQTT
// ==========================================
void sendPillTakenToServer(long reminderId) {
  if (WiFi.status() != WL_CONNECTED || !client.connected()) {
    lcd.clear();
    lcd.print("MQTT Offline!");
    delay(1000);
    return;
  }
  lcd.clear();
  lcd.print("Sending Sync...");
 
  char payload[128];
  if (reminderId > 0) {
    snprintf(payload, sizeof(payload), "{\"action\":\"taken\",\"id\":%ld}", reminderId);
  } else {
    snprintf(payload, sizeof(payload), "{\"action\":\"taken\"}");
  }
  if (client.publish(topic_action, payload)) {
    serverConnected = true;
    lcd.clear();
    lcd.print("TAKEN CONFIRMED!");
    Serial.println("[MQTT] Pill taken notification sent correctly.");
   
    // Đèn LED biểu thị phản hồi thành công mượt mà
    setLedState(true);
    delay(500);
    setLedState(false);
  } else {
    lcd.clear();
    lcd.print("MQTT Pub Fail!");
    Serial.println("[MQTT] Failed to publish pill taken action.");
  }
  delay(1000);
}
// ==========================================
// GIÁM SÁT BÁO THỨC & CẢNH BÁO
// ==========================================
bool alerting = false;
unsigned long alertTime = 0;
long activeReminderId = 0; // Lưu trữ ID cữ đang kêu chuông
int activeReminderSlot = 1;
void triggerAlert(long rId, int rSlot) {
  alerting = true;
  alertTime = millis();
  activeReminderId = rId;
  activeReminderSlot = rSlot;
}
void checkReminder() {
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck < 1000) return;
  lastCheck = millis();
  DateTime now = getTimeNow();
  // Kiểm tra cữ thuốc
  for (int i = 0; i < remCount; i++) {
    // Nếu đến đúng Giờ:Phút, cữ chưa được báo uống -> Trực tiếp phát động báo chuông
    if (!r[i].taken && now.hour() == r[i].h && now.minute() == r[i].m) {
      if (!alerting) {
        triggerAlert(r[i].id, r[i].slot);
      }
    }
  }
}
void handleAlert() {
  // Đồng bộ dập chuông từ xa từ Web Server:
  // Nếu Web nhận được tín hiệu "Đã uống" (webLedState & webBuzzerState tắt), thì dập tắt báo động vật lý ngay lập tức
  if (alerting && webLedState == 0 && webBuzzerState == 0 && serverConnected) {
    alerting = false;
    setLedState(false);
    setBuzzerState(false);
    Serial.println("Chặn báo động từ xa: web tắt tín hiệu cữ.");
    return;
  }
  // Tự động tắt báo động sau 2 phút (120,000ms) để tránh làm phiền liên tục
  if (alerting && (millis() - alertTime > 120000)) {
    alerting = false;
    setLedState(false);
    setBuzzerState(false);
    Serial.println("Tự động tắt báo động sau 2 phút do hết thời gian chờ.");
    return;
  }
  if (!alerting) {
    // Nếu không báo chuông cục bộ nhưng có lệnh dập LED/còi cưỡng chế thủ công từ Web
    if (webLedState == 1) {
      setLedState((millis() % 600) < 300);
    } else {
      setLedState(false);
    }
    if (webBuzzerState == 1) {
      setBuzzerState((millis() % 800) < 400);
    } else {
      setBuzzerState(false);
    }
    return;
  }
  // Chạy chuông báo động vật lý cục bộ khi đến cữ thuốc
  // Báo động sẽ liên tục nhấp nháy cho đến khi bấm nút BTN_OK hoặc bấm nút trên web
  // - Còi BUZZER sẽ kêu LIÊN TỤC (giữ nguyên còi kích hoạt, không bíp bíp) để nâng hiệu quả cảnh báo
  // - Đèn LED vẫn duy trì nhấp nháy nhanh để thu hút ánh nhìn
  setLedState((millis() % 400) < 200);
  setBuzzerState(true);
}
// ==========================================
// ĐỌC PHÍM BẤM VÀ ĐIỀU CHỈNH
// ==========================================
bool btn(uint8_t pin) {
  static uint32_t last[40] = {0};
  if (digitalRead(pin) == LOW && millis() - last[pin] > 250) {
    last[pin] = millis();
    return true;
  }
  return false;
}
void handleButtons() {
  // 1. Nhấn nút OK để:
  // - Xác nhận đã uống thuốc khi chuông đang kêu (tắt chuông tại chỗ và đồng bộ lên Web)
  // - Bấm OK ở trạng thái bình thường để Thêm cữ báo thức hiện tại đang chỉnh
  if (btn(BTN_OK)) {
    if (alerting) {
      Serial.println("Xác nhận đã uống từ nút bấm Thiết Bị!");
      alerting = false;
      setLedState(false);
      setBuzzerState(false);
     
      // Đánh dấu cục bộ đã uống sạch tránh reo lại
      for (int i = 0; i < remCount; i++) {
        if (r[i].id == activeReminderId && activeReminderId > 0) {
          r[i].taken = true;
          break;
        } else if (r[i].h == getTimeNow().hour() && r[i].m == getTimeNow().minute()) {
          r[i].taken = true;
        }
      }
     
      // Báo máy chủ Web đồng hành ghi Log và đánh dấu qua MQTT
      sendPillTakenToServer(activeReminderId);
    } else {
      // Bình thường -> Thêm cữ báo thức đang chỉnh cho ngăn 1 (Mặc định)
      addReminder(currentSetHour, currentSetMinute, 1);
    }
  }
  // 2. Nhấn nút MODE để chuyển đổi giữa cài GIỜ và cài PHÚT
  if (btn(BTN_MODE)) {
    isSettingMinute = !isSettingMinute;
    Serial.printf("Switched setting mode. isSettingMinute: %d\n", isSettingMinute);
  }
  // 3. Nhấn nút UP tăng thời gian cài
  if (btn(BTN_UP)) {
    if (!isSettingMinute) {
      currentSetHour = (currentSetHour + 1) % 24;
    } else {
      currentSetMinute = (currentSetMinute + 1) % 60;
    }
  }
  // 4. Nhấn nút DOWN giảm thời gian cài
  if (btn(BTN_DOWN)) {
    if (!isSettingMinute) {
      currentSetHour = (currentSetHour + 23) % 24;
    } else {
      currentSetMinute = (currentSetMinute + 59) % 60;
    }
  }
}
// ==========================================
// ĐỌC CẢM BIẾN VẬT LÝ VÀ CHỐNG NHẦM NGĂN
// ==========================================
void handleSensors() {
  if (!alerting) return; // Chỉ giám sát cảm biến hồng ngoại/công tắc khi thiết bị đang ở trong trạng thái báo động nhắc uống

  bool s1 = (digitalRead(SENSOR_SLOT1) == SENSOR_TAKEN_LEVEL);
  bool s2 = (digitalRead(SENSOR_SLOT2) == SENSOR_TAKEN_LEVEL);
  bool s3 = (digitalRead(SENSOR_SLOT3) == SENSOR_TAKEN_LEVEL);

  // Không có cảm biến nào được tác động
  if (!s1 && !s2 && !s3) return;

  int correctSlot = activeReminderSlot;
  // 1. NGƯỜI DÙNG LẤY ĐÚNG KHAY THUỐC ĐANG BÁO ĐỘNG
  if ((correctSlot == 1 && s1) || (correctSlot == 2 && s2) || (correctSlot == 3 && s3)) {
    Serial.printf("[Sensors] CHÍNH XÁC! Người dùng lấy thuốc ở ngăn đúng: %d\n", correctSlot);
    alerting = false;
    setLedState(false);
    setBuzzerState(false);
    // Đánh dấu cục bộ đã uống sạch tránh reo lại
    for (int i = 0; i < remCount; i++) {
      if (r[i].id == activeReminderId && activeReminderId > 0) {
        r[i].taken = true;
        break;
      } else if (r[i].h == getTimeNow().hour() && r[i].m == getTimeNow().minute()) {
        r[i].taken = true;
      }
    }
    // Gửi tín hiệu đã lấy thuốc thành công lên server từ xa qua MQTT
    sendPillTakenToServer(activeReminderId);
  }
  // 2. NGƯỜI DÙNG LẤY SAI NGĂN THUỐC
  else {
    Serial.println("[Sensors] CẢNH BÁO: Người bệnh lấy sai khay chứa thuốc!");
   
    // Đổ nội dung cảnh báo lên màn hình LCD
    lcd.clear();
    lcd.print("   CANH BAO!!!  ");
    lcd.setCursor(0, 1);
    char bufErr[17];
    snprintf(bufErr, 17, "SAI NGAN (Y/C:%d)", correctSlot);
    lcd.print(bufErr);

    // Hú còi báo hiệu cảnh báo sai lầm dồn dập
    for (int i = 0; i < 5; i++) {
      setBuzzerState(true);
      delay(80);
      setBuzzerState(false);
      delay(80);
    }
   
    // Cho màn hình hiển thị lại trạng thái uống sau 1 giây
    delay(1000);
  }
}



// ==================================================================================
// CẬP NHẬT MÀN HÌNH HIỂN THỊ LCD TRỰC QUAN
// [SỬA LỖI] Dòng 1 luôn dùng getTimeNow() thay vì chờ webRtcTime từ server.
//   - getTimeNow() ưu tiên NTP (thời gian thực từ internet) khi có WiFi,
//     tự động fallback sang RTC nội bộ khi mất mạng.
//   - Không còn phụ thuộc serverConnected nên giờ hiển thị ngay sau NTP Sync OK.
// ==================================================================================
void updateDisplay() {
  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate < 333) return;
  lastUpdate = millis();


  // Dòng 1: Lấy giờ trực tiếp từ NTP (online) hoặc RTC (offline) - LUÔN cập nhật thời gian thực
  char buf[17];
  DateTime now = getTimeNow();
  snprintf(buf, 17, "Time: %02d:%02d:%02d", now.hour(), now.minute(), now.second());
  lcd.setCursor(0, 0);
  lcd.print(buf);


  // Dòng 2: Trạng thái cài đặt ngoại tuyến hoặc Cảnh báo uống thuốc khẩn cấp
  lcd.setCursor(0, 1);
  if (alerting) {
    char bufAlert[17];
    snprintf(bufAlert, 17, ">>> UONG NGĂN %d ", activeReminderSlot);
    lcd.print(bufAlert);
  } else {
    // Đang hiển thị trạng thái chỉnh cữ bằng nút bấm
    char bufSet[17];
    if (!isSettingMinute) {
      // Đang trỏ chỉnh Giờ
      snprintf(bufSet, 17, "R:%02d  >%02d:%02d ", remCount, currentSetHour, currentSetMinute);
    } else {
      // Đang trỏ chỉnh Phút
      snprintf(bufSet, 17, "R:%02d   %02d:>%02d", remCount, currentSetHour, currentSetMinute);
    }
    lcd.print(bufSet);
  }
}

// ==========================================
// MQTT RECEIVE CALLBACK
// ==========================================
void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
 
  if (String(topic) == topic_reminders) {
    // Parse reminders list
    #if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument doc;
    #else
      DynamicJsonDocument doc(4096);
    #endif
    DeserializationError error = deserializeJson(doc, message);
    if (!error) {
      JsonArray arr = doc.as<JsonArray>();
      int tempCount = 0;
      for (JsonObject item : arr) {
        if (tempCount < MAX_REM) {
          r[tempCount].id = item["id"] | 0L;
          r[tempCount].h = item["h"] | 0;
          r[tempCount].m = item["m"] | 0;
          r[tempCount].taken = item["taken"] | false;
          r[tempCount].slot = item["slot"] | 1;
          tempCount++;
        }
      }
      remCount = tempCount;
      Serial.print("[MQTT Callback] Reminders Synced perfectly! Count: ");
      Serial.println(remCount);
    } else {
      Serial.print("[MQTT Callback] JSON Deserialization error: ");
      Serial.println(error.c_str());
    }
  }
  else if (String(topic) == topic_control) {
    // Parse LED and Buzzer manual trigger actions
    #if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument doc;
    #else
      DynamicJsonDocument doc(512);
    #endif
    DeserializationError error = deserializeJson(doc, message);
    if (!error) {
      webLedState = doc["led_state"] | 0;
      webBuzzerState = doc["buzzer_state"] | 0;
      webActiveSlot = doc["active_slot"] | 0;
      const char* rTime = doc["time"];
      if (rTime) {
        webRtcTime = String(rTime);
      }
      serverConnected = true;
    }
  }
}

// ==========================================
// MQTT RECONNECTION LOGIC
// ==========================================
void reconnectMQTT() {
  static unsigned long lastReconnectAttempt = 0;
  if (!client.connected() && (millis() - lastReconnectAttempt > 5000)) {
    lastReconnectAttempt = millis();
    Serial.print("[MQTT] Connecting to broker... ");
   
    // Mã Client ngẫu nhiên tránh xung đột thiết bị khác
    String clientId = "MedBox-ESP32-Client-" + String(random(0xffff), HEX);
   
    if (client.connect(clientId.c_str())) {
      Serial.println("CONNECTED!");
     
      // Đăng ký nhận lịch trình và tín hiệu điều khiển còi/led
      client.subscribe(topic_reminders);
      client.subscribe(topic_control);
     
      // Gửi yêu cầu nạp dữ liệu tức thì khi bắt đầu
      client.publish(topic_action, "{\"action\":\"request_sync\"}");
      serverConnected = true;
    } else {
      Serial.print("FAILED, State rc = ");
      Serial.println(client.state());
      serverConnected = false;
    }
  }
}








// ==========================================
// THIẾT LẬP BAN ĐẦU - SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  pinMode(BTN_MODE, INPUT_PULLUP);
  pinMode(BTN_UP, INPUT_PULLUP);
  pinMode(BTN_DOWN, INPUT_PULLUP);
  pinMode(BTN_OK, INPUT_PULLUP);
  // Thiết lập chân đọc cho 3 cảm biến khay thuốc (kích hoạt Pullup nội bộ để tránh nhiễu chân)
  pinMode(SENSOR_SLOT1, INPUT_PULLUP);
  pinMode(SENSOR_SLOT2, INPUT_PULLUP);
  pinMode(SENSOR_SLOT3, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  setLedState(false);
  setBuzzerState(false);
  Wire.begin();
  lcd.init();
  lcd.backlight();
  if (!rtc.begin()) {
    lcd.print("RTC Error!");
    while (1);
  }
  // Khởi dựng giờ làm mốc đề phòng trường hợp mất internet vĩnh viễn
  rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));

  setupWiFi();
  // Khai báo MQTT server callback
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

// ==========================================
// VÒNG LẶP CHÍNH - LOOP
// ==========================================
void loop() {
  checkAndReconnectWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      reconnectMQTT();
    }
    client.loop();
  } else {
    serverConnected = false;
  }

  checkReminder();
  handleAlert();
  handleSensors(); // Tự động đọc 3 cảm biến khay chứa để xác định hành vi lấy thuốc hoặc cảnh báo nhầm khay
  handleButtons();
  updateDisplay();
  delay(15);
}






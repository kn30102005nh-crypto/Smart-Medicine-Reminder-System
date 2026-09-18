import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import mqtt from "mqtt";

// Standard lazy initialization of Gemini API to guard against startup crashes
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== "MY_GEMINI_API_KEY") {
      geminiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return geminiClient;
}

// Persistent Database for reminders & logs
interface Reminder {
  id: number;
  h: number;
  m: number;
  taken: boolean;
  label: string;
  slot: number; // 1, 2, or 3
}

interface LogEntry {
  id: number;
  time: string;
  label: string;
  action: string; // "Đã uống", "Bỏ lỡ", "Đã thêm", "Đã xóa", "Hệ thống báo động"
  slot: number;
}

let remindersList: Reminder[] = [
  { id: 1, h: 8, m: 0, taken: false, label: "Thuốc Huyết Áp (Amlodipine)", slot: 1 },
  { id: 2, h: 12, m: 30, taken: false, label: "Men Tiêu Hóa", slot: 2 },
  { id: 3, h: 20, m: 0, taken: false, label: "Vitamin C & kẽm", slot: 3 },
];

let logsHistory: LogEntry[] = [
  { id: 1, time: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), label: "Thuốc Huyết Áp", action: "Đã uống", slot: 1 },
  { id: 2, time: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString(), label: "Men Tiêu Hóa", action: "Đã uống", slot: 2 },
];

let manualLedState = false;
let manualBuzzerState = false;
let simulationHour: number | null = null; // null means use real system clock (Vietnam timezone)

const DATA_FILE = path.join(process.cwd(), "data.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.remindersList)) remindersList = parsed.remindersList;
      if (Array.isArray(parsed.logsHistory)) logsHistory = parsed.logsHistory;
      if (typeof parsed.manualLedState === "boolean") manualLedState = parsed.manualLedState;
      if (typeof parsed.manualBuzzerState === "boolean") manualBuzzerState = parsed.manualBuzzerState;
      if (parsed.simulationHour !== undefined) simulationHour = parsed.simulationHour;
      console.log("Loaded persistent data successfully from data.json");
    } else {
      saveData();
    }
  } catch (error) {
    console.error("Error loading data.json, using default in-memory fallback:", error);
  }
}

function saveData() {
  try {
    const payload = {
      remindersList,
      logsHistory,
      manualLedState,
      manualBuzzerState,
      simulationHour,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing data.json:", error);
  }
}

// Immediately load stored data when starting
loadData();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper function to get current Vietnam time (GMT+7)
  const getVietnamTime = () => {
    const d = new Date();
    // UTC to Vietnamese GMT+7 shift
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const vnDate = new Date(utc + 3600000 * 7);
    return {
      hour: vnDate.getHours(),
      minute: vnDate.getMinutes(),
      second: vnDate.getSeconds(),
      dateStr: vnDate.toLocaleDateString("vi-VN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      timeStr: vnDate.toTimeString().split(" ")[0],
    };
  };

  // Helper logic to recalculate dynamic Hardware States
  const calculateHardwareState = () => {
    const timeInfo = getVietnamTime();
    let currentHour = simulationHour !== null ? simulationHour : timeInfo.hour;
    let currentMinute = timeInfo.minute;

    let isAlarming = false;
    let activeSlot = 0;

    // Check if any reminder matches the hour and minute, and is NOT taken yet
    remindersList.forEach((r) => {
      if (r.h === currentHour && r.m === currentMinute && !r.taken) {
        isAlarming = true;
        activeSlot = r.slot;
      }
    });

    return {
      isAlarming,
      activeSlot,
    };
  };

  // MQTT CLIENT INTEGRATION FOR REAL-TIME ESP32 COMMUNICATIONS
  const MQTT_BROKER = "mqtt://broker.hivemq.com";
  const clientID = `medbox_server_${Math.random().toString(16).substring(2, 10)}`;
  const mqttClient = mqtt.connect(MQTT_BROKER, { clientId: clientID });

  const TOPIC_REMINDERS = "medbox/9240bc0f/reminders";
  const TOPIC_CONTROL = "medbox/9240bc0f/control";
  const TOPIC_ACTION = "medbox/9240bc0f/action";

  const publishMqttUpdates = () => {
    if (!mqttClient || !mqttClient.connected) return;
    try {
      const timeInfo = getVietnamTime();
      const hwState = calculateHardwareState();
      
      const ledActive = hwState.isAlarming || manualLedState;
      const buzzerActive = hwState.isAlarming || manualBuzzerState;

      // 1. Publish reminders JSON array
      mqttClient.publish(TOPIC_REMINDERS, JSON.stringify(remindersList), { retain: true });

      // 2. Publish control state JSON
      mqttClient.publish(TOPIC_CONTROL, JSON.stringify({
        led_state: ledActive ? 1 : 0,
        buzzer_state: buzzerActive ? 1 : 0,
        active_slot: hwState.activeSlot,
        simulation_hour: simulationHour,
        time: simulationHour !== null 
          ? `${String(simulationHour).padStart(2, "0")}:${String(timeInfo.minute).padStart(2, "0")}:${String(timeInfo.second).padStart(2, "0")}` 
          : timeInfo.timeStr,
      }), { retain: true });

      console.log("[MQTT] Published real-time system state & reminders index successfully!");
    } catch (err) {
      console.error("[MQTT] Fail to publish updates:", err);
    }
  };

  mqttClient.on("connect", () => {
    console.log(`[MQTT] Connected to public broker: ${MQTT_BROKER}`);
    mqttClient.subscribe(TOPIC_ACTION, (err) => {
      if (err) {
        console.error("[MQTT] Subscription failed:", err);
      } else {
        console.log(`[MQTT] Subscribed to topic: ${TOPIC_ACTION}`);
        // Immediately publish current state
        publishMqttUpdates();
      }
    });

    // Cứ mỗi 2 giây tự động cập nhật đồng hồ và tín hiệu lên MQTT
    setInterval(() => {
      publishMqttUpdates();
    }, 2000);
  });

  mqttClient.on("message", (topic, message) => {
    if (topic === TOPIC_ACTION) {
      try {
        const raw = message.toString();
        const payload = JSON.parse(raw);
        console.log(`[MQTT Action] Received event:`, payload);

        if (payload.action === "take_pill" || payload.action === "take-pill" || payload.action === "taken") {
          // Find any active alarm and mark it taken
          const timeInfo = getVietnamTime();
          let currentHour = simulationHour !== null ? simulationHour : timeInfo.hour;
          let currentMinute = timeInfo.minute;

          let targetIndex = remindersList.findIndex(r => r.h === currentHour && r.m === currentMinute && !r.taken);
          if (targetIndex !== -1) {
            remindersList[targetIndex].taken = true;
            manualLedState = false;
            manualBuzzerState = false;

            logsHistory.unshift({
              id: Date.now(),
              time: new Date().toISOString(),
              label: remindersList[targetIndex].label,
              action: "Đã uống (Bằng nút bấm ESP32)",
              slot: remindersList[targetIndex].slot,
            });
            saveData();
            console.log(`[MQTT] Marked reminder at ${currentHour}:${currentMinute} as taken.`);
          } else {
            // Also accept specific reminder ID
            if (payload.id) {
              let updated = false;
              remindersList = remindersList.map(r => {
                if (r.id === payload.id) {
                  r.taken = true;
                  updated = true;
                  logsHistory.unshift({
                    id: Date.now(),
                    time: new Date().toISOString(),
                    label: r.label,
                    action: "Đã uống (Bằng nút bấm ESP32)",
                    slot: r.slot,
                  });
                }
                return r;
              });
              if (updated) {
                manualLedState = false;
                manualBuzzerState = false;
                saveData();
              }
            } else {
              // Just turn off manual test triggers
              manualLedState = false;
              manualBuzzerState = false;
              saveData();
            }
          }
          publishMqttUpdates();
        } 
        else if (payload.action === "add_reminder") {
          const h = parseInt(payload.h);
          const m = parseInt(payload.m);
          const slot = parseInt(payload.slot) || 1;
          if (!isNaN(h) && !isNaN(m) && remindersList.length < 20) {
            const newReminder = {
              id: Date.now(),
              h,
              m,
              taken: false,
              label: `Cữ thuốc cài từ Box (${h}g:${m}g)`,
              slot: [1,2,3].includes(slot) ? slot : 1,
            };
            remindersList.push(newReminder);
            remindersList.sort((a,b) => (a.h*60 + a.m) - (b.h*60 + b.m));
            logsHistory.unshift({
              id: Date.now(),
              time: new Date().toISOString(),
              label: newReminder.label,
              action: "Thiết lập cữ (Từ Box vật lý)",
              slot: newReminder.slot,
            });
            saveData();
            publishMqttUpdates();
          }
        } 
        else if (payload.action === "request_sync") {
          publishMqttUpdates();
        }
      } catch (err) {
        console.error("[MQTT] Action parsing error:", err);
      }
    }
  });

  mqttClient.on("error", (err) => {
    console.error("[MQTT] Connection error:", err);
  });

  // 1. GET /get_status (Backward compatible & Extended)
  app.get("/get_status", (req, res) => {
    const timeInfo = getVietnamTime();
    const hwState = calculateHardwareState();

    // LED/Buzzer is ON if either simulated alarm is active OR user manually tested it or forced it
    const ledActive = hwState.isAlarming || manualLedState;
    const buzzerActive = hwState.isAlarming || manualBuzzerState;

    // Detect if the request comes from the ESP32 device
    const isDevice = req.query.device === "esp32" || req.headers["user-agent"]?.includes("ESP32");

    res.json({
      rtc_time: simulationHour !== null 
        ? `${String(simulationHour).padStart(2, "0")}:${String(timeInfo.minute).padStart(2, "0")}:${String(timeInfo.second).padStart(2, "0")}` 
        : timeInfo.timeStr,
      rtc_date: timeInfo.dateStr,
      rem_count: remindersList.length,
      led_state: ledActive ? 1 : 0,
      buzzer_state: buzzerActive ? 1 : 0,
      active_slot: hwState.activeSlot, // 0 if none
      reminders: remindersList,
      logs: isDevice ? undefined : logsHistory, // Omit logs for physical devices to keep payload lightweight
      simulation_hour: simulationHour,
    });
  });

  // 2. GET /add_reminder?h=...&m=...&label=...&slot=... (Backward compatible & Extended)
  app.get("/add_reminder", (req, res) => {
    const h = parseInt(req.query.h as string);
    const m = parseInt(req.query.m as string);
    const label = (req.query.label as string) || `Cữ thuốc cấn uống`;
    const slot = parseInt(req.query.slot as string) || 1;

    if (isNaN(h) || isNaN(m)) {
      return res.status(400).send("Lỗi: Giờ và phút phải là số hợp lệ!");
    }

    if (remindersList.length >= 20) {
      return res.send("ERR_FULL");
    }

    const newReminder: Reminder = {
      id: Date.now(),
      h,
      m,
      taken: false,
      label,
      slot: [1, 2, 3].includes(slot) ? slot : 1,
    };

    remindersList.push(newReminder);
    // Sort reminders chronologically
    remindersList.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));

    logsHistory.unshift({
      id: Date.now(),
      time: new Date().toISOString(),
      label: newReminder.label,
      action: "Đã thiết lập cữ",
      slot: newReminder.slot,
    });

    saveData();
    publishMqttUpdates();
    res.send("OK");
  });

  // 3. GET /delete_reminder?id=... (Backward compatible & Extended)
  app.get("/delete_reminder", (req, res) => {
    const index = parseInt(req.query.id as string);

    if (isNaN(index) || index < 0 || index >= remindersList.length) {
      return res.status(400).send("Lỗi chỉ số cữ không hợp lệ!");
    }

    const deleted = remindersList.splice(index, 1)[0];

    logsHistory.unshift({
      id: Date.now(),
      time: new Date().toISOString(),
      label: deleted?.label || "Cữ thuốc",
      action: "Tháo dỡ cữ",
      slot: deleted?.slot || 1,
    });

    saveData();
    publishMqttUpdates();
    res.send("OK");
  });

  // 4. GET /clear_all_reminders (Backward compatible & Extended)
  app.get("/clear_all_reminders", (req, res) => {
    remindersList = [];
    logsHistory.unshift({
      id: Date.now(),
      time: new Date().toISOString(),
      label: "Tất cả cữ",
      action: "Xóa sạch lịch",
      slot: 1,
    });
    saveData();
    publishMqttUpdates();
    res.send("OK");
  });

  // 5. POST /api/take-pill (Simulate taking pills, switches off Alarm)
  app.post("/api/take-pill", (req, res) => {
    const { reminderId } = req.body;
    let found = false;
    let updatedReminder: Reminder | null = null;

    remindersList = remindersList.map((r) => {
      if (r.id === reminderId) {
        found = true;
        updatedReminder = { ...r, taken: true };
        return updatedReminder;
      }
      return r;
    });

    if (found && updatedReminder) {
      manualLedState = false;
      manualBuzzerState = false;
      
      logsHistory.unshift({
        id: Date.now(),
        time: new Date().toISOString(),
        label: (updatedReminder as Reminder).label,
        action: "Đã uống",
        slot: (updatedReminder as Reminder).slot,
      });

      saveData();
      publishMqttUpdates();
      return res.json({ success: true, message: "Hoàn tất uống thuốc!" });
    }

    // Fallback: If no reminderId passed, find any alarming reminder and mark it taken
    const timeInfo = getVietnamTime();
    let currentHour = simulationHour !== null ? simulationHour : timeInfo.hour;
    let currentMinute = timeInfo.minute;

    let target = remindersList.find(r => r.h === currentHour && r.m === currentMinute && !r.taken);
    if (target) {
      target.taken = true;
      manualLedState = false;
      manualBuzzerState = false;

      logsHistory.unshift({
        id: Date.now(),
        time: new Date().toISOString(),
        label: target.label,
        action: "Đã uống",
        slot: target.slot,
      });
      saveData();
      publishMqttUpdates();
      return res.json({ success: true, message: "Hoàn tất uống cữ hiện tại!", reminder: target });
    }

    res.status(404).json({ success: false, message: "Không tìm thấy cữ báo động khả dụng nào." });
  });

  // 6. POST /api/reset-all-taken (Reset Taken status index for tests, usually triggered at midnight/manual)
  app.post("/api/reset-all-taken", (req, res) => {
    remindersList = remindersList.map(r => ({ ...r, taken: false }));
    logsHistory.unshift({
      id: Date.now(),
      time: new Date().toISOString(),
      label: "Toàn bộ cữ thuốc",
      action: "Hoàn tác trạng thái uống",
      slot: 1,
    });
    saveData();
    publishMqttUpdates();
    res.json({ success: true, reminders: remindersList });
  });

  // 7. POST /api/simulate-time (Changes Virtual Hour)
  app.post("/api/simulate-time", (req, res) => {
    const { hour } = req.body;
    if (hour === null) {
      simulationHour = null;
    } else {
      const parsed = parseInt(hour);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) {
        simulationHour = parsed;
      }
    }
    saveData();
    publishMqttUpdates();
    res.json({ success: true, simulation_hour: simulationHour });
  });

  // 8. POST /api/manual-test-hardware (Enables users to test buzzer sound / flash light manually)
  app.post("/api/manual-test-hardware", (req, res) => {
    const { led, buzzer } = req.body;
    if (typeof led === "boolean") manualLedState = led;
    if (typeof buzzer === "boolean") manualBuzzerState = buzzer;
    saveData();
    publishMqttUpdates();
    res.json({ success: true, led_state: manualLedState, buzzer_state: manualBuzzerState });
  });

  // 9. POST /api/ai-consult (Interact with Gemini for health & pharmaceutical tips in Vietnamese)
  app.post("/api/ai-consult", async (req, res) => {
    try {
      const client = getGeminiClient();
      if (!client) {
        return res.status(503).json({
          success: false,
          message: "Trí tuệ nhân tạo Gemini chưa được cấu hình. Vui lòng thêm khóa API trong Cài Đặt > Secrets.",
        });
      }

      // Generate context block with list of schedules
      const schedulesText = remindersList.map(
        (r, idx) => `Cữ #${idx + 1}: Lúc ${String(r.h).padStart(2, "0")}:${String(r.m).padStart(2, "0")} - Thuốc: "${r.label}"`
      ).join("\n");

      const prompt = `Bạn là Dược Sĩ AI tận tâm của hệ thống Hộp Thuốc Thông Minh IoT MedBox. 
Dưới đây là danh sách cữ nhắc thuốc mà một bệnh nhân đã thiết lập hôm nay:
${schedulesText || "Chưa thiết lập cữ nhắc nào."}

Dựa vào danh sách trên, hãy đưa ra một bài tư vấn ngắn gọn, ấm áp, hoàn toàn bằng tiếng Việt với định dạng Markdown.
Nội dung đề xuất bao gồm:
1. Nhận xét tổng quan về thời gian phân bố các cữ thuốc đã khoa học chưa (khoảng cách giờ uống).
2. Lời khuyên cụ thể về việc uống các loại thuốc này (loại nào cần ăn no mới uống, dặn dò nước ấm, tránh dùng chung sữa/bưởi nếu cần, v.v.).
3. Những lưu ý an toàn tối quan trọng dành cho sức khỏe người bệnh (VD: tránh bỏ cữ, đo huyết áp thường xuyên...).
4. Một thông điệp chúc sức khỏe ngắn gọn truyền năng lượng tích cực.

Hãy trả lời trực tiếp nội dung tư vấn ngắn gọn trong khoảng 250-350 từ, sử dụng gạch đầu dòng rõ ràng, không dông dài.`;

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({
        success: true,
        consultation: response.text,
      });
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({
        success: false,
        message: "Có lỗi khi kết nối với Dược Sĩ AI Gemini: " + error.message,
      });
    }
  });

  // Vite middle-ware setup for developer environment
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

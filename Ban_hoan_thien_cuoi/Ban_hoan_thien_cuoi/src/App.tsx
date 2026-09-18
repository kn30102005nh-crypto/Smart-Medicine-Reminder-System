import React, { useState, useEffect } from "react";
import { 
  Pill, 
  Clock, 
  Volume2, 
  VolumeX, 
  Lightbulb, 
  Flame, 
  Plus, 
  Trash2, 
  Sparkles, 
  Activity, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  Calendar,
  Layers,
  HeartPulse,
  BrainCircuit,
  Eye,
  RefreshCw,
  BellRing,
  Check
} from "lucide-react";
import { Reminder, LogEntry, MedBoxStatus } from "./types";

export default function App() {
  const [status, setStatus] = useState<MedBoxStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isConsulting, setIsConsulting] = useState<boolean>(false);
  
  // Form input fields for adding alarm
  const [inputTime, setInputTime] = useState<string>("08:00");
  const [inputLabel, setInputLabel] = useState<string>("");
  const [inputSlot, setInputSlot] = useState<number>(1);
  
  // Custom hour slider for simulating day-time transition
  const [simHour, setSimHour] = useState<number | null>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const serverUrlToCopy = typeof window !== "undefined" ? window.location.origin : "https://...";

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(serverUrlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Suggested labels to make inputting quick and friendly for elder users or carers
  const suggestedPills = [
    { label: "Thuốc Huyết Áp (Amlodipine)", slot: 1 },
    { label: "Thuốc Tiểu Đường (Metformin)", slot: 1 },
    { label: "Men Tiêu Hóa (Enzymes)", slot: 2 },
    { label: "Vitamin C & kẽm", slot: 3 },
    { label: "Loratadine chống dị ứng", slot: 2 },
    { label: "Calcium & D3", slot: 3 }
  ];

  // Fetch complete device/system status from API
  const fetchStatus = async () => {
    try {
      const response = await fetch("/get_status");
      if (!response.ok) {
        throw new Error("Không thể kết nối đến máy chủ IoT MedBox");
      }
      const data = await response.json();
      setStatus(data);
      if (simHour === null && data.simulation_hour !== undefined) {
        setSimHour(data.simulation_hour);
      }
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError("Đang ngắt kết nối với thiết bị. Kiểm tra mạng hoặc bật Server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // Format active ISO strings or date representations in a lovely human-readable format
  const formatTimeAgo = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString;
    }
  };

  // Add Medication Alarm
  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTime) return;
    const [h, m] = inputTime.split(":").map(Number);
    const labelClean = inputLabel.trim() || `Thuốc Cữ ${h}g:${m}g`;
    
    setIsSubmitting(true);
    try {
      const url = `/add_reminder?h=${h}&m=${m}&label=${encodeURIComponent(labelClean)}&slot=${inputSlot}`;
      const res = await fetch(url);
      const text = await res.text();
      if (text === "ERR_FULL") {
        alert("⚠️ Bộ nhớ hộp thuốc đầy! Giới hạn tối đa là 20 lịch nhắc nhở hôm nay.");
      } else {
        setInputLabel("");
        fetchStatus();
      }
    } catch (err) {
      alert("⚠️ Thiết lập cữ thuốc thất bại. Vui lòng thử lại!");
    } finally {
      setIsSubmitting(false);
    }
  };

  // State for clear-all confirmation bypass
  const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);

  // Delete specific alarm
  const handleDeleteReminder = async (index: number, label: string) => {
    try {
      const res = await fetch(`/delete_reminder?id=${index}`);
      if (res.ok) {
        fetchStatus();
      }
    } catch (err) {
      console.error("Lỗi xóa cữ:", err);
    }
  };

  // Clear all alarms
  const handleClearAll = async () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      // reset confirmation after 3 seconds if not clicked again
      setTimeout(() => setIsConfirmingClear(false), 3000);
      return;
    }

    try {
      await fetch("/clear_all_reminders");
      setIsConfirmingClear(false);
      fetchStatus();
    } catch (err) {
      console.error("Lỗi xóa toàn bộ cữ:", err);
    }
  };

  // Confirm Pills Taken
  const handleTakePill = async (id?: number) => {
    try {
      const res = await fetch("/api/take-pill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderId: id }),
      });
      if (res.ok) {
        fetchStatus();
      }
    } catch (err) {
      alert("⚠️ Thao tác thất bại.");
    }
  };

  // Reset Taken States for Simulation/Testing
  const handleResetTaken = async () => {
    try {
      const res = await fetch("/api/reset-all-taken", { method: "POST" });
      if (res.ok) {
        fetchStatus();
      }
    } catch (err) {
      alert("⚠️ Thao tác thất bại.");
    }
  };

  // Simulate Specific Clock Hour
  const handleSimulateHour = async (hour: number | null) => {
    setSimHour(hour);
    try {
      await fetch("/api/simulate-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hour }),
      });
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  // Manual Trigger Hardware Testing features
  const handleHardwareTest = async (type: "led" | "buzzer", state: boolean) => {
    try {
      const bodyPayload = type === "led" ? { led: state } : { buzzer: state };
      await fetch("/api/manual-test-hardware", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  // Request smart advice from Pharmacist Gemini AI
  const handleGetAiConsult = async () => {
    setIsConsulting(true);
    setAiResponse(null);
    try {
      const res = await fetch("/api/ai-consult", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setAiResponse(data.consultation);
      } else {
        setAiResponse(`⚠️ Lỗi từ Dược Sĩ AI: ${data.message}`);
      }
    } catch (err) {
      setAiResponse("⚠️ Không thể kết nối đến máy chủ AI. Hãy đảm bảo bạn đã cung cấp khóa GEMINI_API_KEY trong thẻ Secrets.");
    } finally {
      setIsConsulting(false);
    }
  };

  // Detect whether there's an ongoing active alarm
  const isAlarming = status ? (status.led_state === 1 || status.buzzer_state === 1) : false;
  const activeAlarmReminder = status?.reminders.find(
    r => r.h === (status.simulation_hour !== null ? status.simulation_hour : parseInt(status.rtc_time.split(":")[0])) &&
         r.m === parseInt(status.rtc_time.split(":")[1]) && !r.taken
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 antialiased">
      {/* Dynamic Header */}
      <header id="medbox-header" className="bg-white rounded-2xl p-6 mb-8 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200/80">
            <Pill className="w-8 h-8 animate-bounce" />
          </div>
          <div className="text-center md:text-left">
            <h1 className="font-display font-extrabold text-2xl md:text-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 bg-clip-text text-transparent">
              IoT Smart MedBox
            </h1>
            <p className="text-slate-500 text-sm mt-1 font-medium">
              Hệ thống giám sát, phân phối khay thuốc & báo lịch cữ uống thời gian thực
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {error ? (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-full text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span>Mất Kết Nối: {error}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-full text-xs font-bold shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse-success" />
              <span>Thiết Bị Trực Tuyến (ESP32)</span>
            </div>
          )}
          <button 
            onClick={fetchStatus} 
            className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-all border border-slate-220 active:scale-95"
            title="Đồng bộ thủ công"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8" id="dashboard-grid">
        
        {/* LEFT COLUMN: Hardware Telemetry, Physical Simulation Box & Simulated Clock */}
        <div className="lg:col-span-1 flex flex-col gap-8">
          
          {/* Block 1: Time Synchronization & Simulation Clock Controls */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl font-sans" />
            
            <h2 className="font-display font-bold text-slate-800 text-base flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-teal-600" />
              Đồng Hồ Hệ Thống (RTC)
            </h2>

            <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100 mb-4 shadow-sm">
              <div className="font-mono text-4xl md:text-5xl font-extrabold text-teal-600 tracking-wider">
                {status?.rtc_time || "00:00:00"}
              </div>
              <div className="text-slate-500 text-sm mt-2 font-medium">
                {status?.rtc_date || "Đang kết nối..."}
              </div>
              {status?.simulation_hour !== null && (
                <div className="inline-block mt-3 bg-amber-50 text-amber-700 text-xs px-3 py-1 rounded-full border border-amber-200 font-semibold uppercase tracking-wider animate-pulse">
                  🕒 Chế độ giả lập bật
                </div>
              )}
            </div>

            {/* Simulated Time Controller Slider */}
            <div className="">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2 flex justify-between">
                <span>Giả lập giờ tủ thuốc:</span>
                <span className="font-mono text-emerald-600 text-sm font-bold">
                  {simHour !== null ? `${simHour}h` : "Mặc định (Thực tế)"}
                </span>
              </label>
              
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="0" 
                  max="23" 
                  value={simHour !== null ? simHour : ""} 
                  onChange={(e) => {
                    const val = e.target.value;
                    handleSimulateHour(val === "" ? null : parseInt(val));
                  }}
                  className="w-full accent-teal-600 bg-slate-200 rounded-lg h-2 cursor-pointer"
                  placeholder="Giờ thực tế"
                />
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => {
                    setSimHour(null);
                    handleSimulateHour(null);
                  }}
                  disabled={simHour === null}
                  className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-xs text-slate-600 disabled:text-slate-350 disabled:opacity-40 rounded-lg flex items-center justify-center gap-1.5 transition-all outline-none border border-slate-200/80 font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Thể Theo Thực Tế
                </button>
                
                {/* Time Jump Fast buttons */}
                <button
                  onClick={() => {
                    setSimHour(8);
                    handleSimulateHour(8);
                  }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono font-bold transition-all ${
                    simHour === 8 ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  08g
                </button>
                <button
                  onClick={() => {
                    setSimHour(12);
                    handleSimulateHour(12);
                  }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono font-bold transition-all ${
                    simHour === 12 ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  12g
                </button>
                <button
                  onClick={() => {
                    setSimHour(20);
                    handleSimulateHour(20);
                  }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono font-bold transition-all ${
                    simHour === 20 ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  20g
                </button>
              </div>
            </div>
          </div>

          {/* Block 2: Interactive Smart MedBox Physical Compartments (Phát hiện khay chứa thuốc hoạt họa) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative animate-fade-in">
            <h2 className="font-display font-bold text-slate-800 text-base flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-indigo-600" />
              Khay Chia Thuốc Vật Lý (3 Ngăn)
            </h2>
            
            <p className="text-slate-500 text-xs mb-4 font-medium">
              Biểu diễn trực quan 3 khoang chứa thuốc của thiết bị IoT bên ngoài. Ngăn nào nhấp nháy đỏ nghĩa là đến cữ uống thuốc tương ứng!
            </p>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[1, 2, 3].map((slotNum) => {
                const isActiveSlot = status?.active_slot === slotNum;
                let slotName = slotNum === 1 ? "Sáng" : slotNum === 2 ? "Trưa" : "Tối";
                let slotColor = slotNum === 1 ? "from-amber-400 to-amber-500" : slotNum === 2 ? "from-emerald-400 to-teal-500" : "from-indigo-400 to-indigo-500";
                
                return (
                  <div 
                    key={slotNum}
                    className={`relative rounded-xl p-3 border transition-all flex flex-col items-center text-center ${
                      isActiveSlot 
                        ? 'bg-red-50 border-red-400 shadow-sm animate-pulse-alarm' 
                        : 'bg-slate-50/80 border-slate-200'
                    }`}
                  >
                    {/* Glowing LED Dot indicator */}
                    <div className="absolute top-2 right-2 flex items-center">
                      <span className={`w-2.5 h-2.5 rounded-full ${isActiveSlot ? 'bg-red-500 animate-ping' : 'bg-slate-300'}`} />
                    </div>

                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${slotColor} text-white flex items-center justify-center font-bold text-sm mb-2 shadow-sm`}>
                      {slotNum}
                    </div>

                    <span className="text-xs font-bold text-slate-750">{slotName}</span>
                    <span className="text-[10px] text-slate-500 mt-1 capitalize font-semibold">Ngăn #{slotNum}</span>
                  </div>
                );
              })}
            </div>

            {/* Quick Action Button to Simulate Taking Pills */}
            <div className="space-y-3">
              {isAlarming ? (
                <button
                  onClick={() => handleTakePill(activeAlarmReminder?.id)}
                  className="w-full py-3.5 bg-gradient-to-r from-red-500 to-orange-500 hover:brightness-110 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Check className="w-5 h-5 animate-pulse" />
                  XÁC NHẬN ĐÃ UỐNG THUỐC
                </button>
              ) : (
                <button
                  disabled
                  className="w-full py-3 bg-slate-100 text-slate-450 font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200"
                >
                  <CheckCircle2 className="w-4 h-4 text-slate-400" />
                  Đang chờ tín hiệu báo thức...
                </button>
              )}
              
              <button
                onClick={handleResetTaken}
                className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all border border-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Hoàn tác toàn bộ cữ đã uống (Test)
              </button>
            </div>
          </div>

          {/* Block 3: Device Components Real-Time Pin States & Testing */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative">
            <h2 className="font-display font-bold text-slate-800 text-base flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-emerald-600" />
              Công Cụ Kiểm Thử Phần Cứng
            </h2>

            <div className="space-y-4">
              {/* LED Block */}
              <div className="bg-slate-50/85 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg border ${status?.led_state === 1 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    <Lightbulb className={`w-5 h-5 ${status?.led_state === 1 ? 'animate-pulse' : ''}`} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-750">Đèn LED Báo Hiệu</span>
                    <span className="text-[10px] text-slate-500 font-semibold">Giám sát hiển thị hoặc trạng thái</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status?.led_state === 1 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {status?.led_state === 1 ? "ĐANG SÁNG" : "ĐANG TẮT"}
                  </span>
                  
                  <button
                    onClick={() => handleHardwareTest("led", status?.led_state === 0)}
                    className={`w-10 h-6 rounded-full p-1 transition-all cursor-pointer ${status?.led_state === 1 ? 'bg-amber-500' : 'bg-slate-300'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full transition-all transform ${status?.led_state === 1 ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {/* Buzzer Block */}
              <div className="bg-slate-50/85 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg border ${status?.buzzer_state === 1 ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {status?.buzzer_state === 1 ? <Volume2 className="w-5 h-5 animate-bounce" /> : <VolumeX className="w-5 h-5" />}
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-750">Còi Hú Buzzer</span>
                    <span className="text-[10px] text-slate-500 font-semibold">Âm thanh cảnh báo nhắc uống</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status?.buzzer_state === 1 ? 'bg-indigo-100 text-indigo-700 border-indigo-205' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {status?.buzzer_state === 1 ? "ĐANG REO" : "ĐANG TẮT"}
                  </span>

                  <button
                    onClick={() => handleHardwareTest("buzzer", status?.buzzer_state === 0)}
                    className={`w-10 h-6 rounded-full p-1 transition-all cursor-pointer ${status?.buzzer_state === 1 ? 'bg-indigo-500' : 'bg-slate-300'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full transition-all transform ${status?.buzzer_state === 1 ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* MIDDLE & RIGHT COMBINED COLUMN FOR PRECISE REMINDERS AND CHAT AI */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          
          {/* Main alarm scheduler */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm animate-fade-in animate-duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <h2 className="font-display font-bold text-slate-800 text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Lập Lịch Nhắc Uống Thuốc Trong Ngày
              </h2>
              <span className="text-xs font-bold font-mono bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">
                {status?.reminders.length || 0} cữ đã cấu hình
              </span>
            </div>

            {/* Form to add alarm */}
            <form onSubmit={handleAddReminder} className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200 mb-6 font-sans">
              <span className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-3">
                ➕ Thêm Kế Hoạch Uống Thuốc Mới
              </span>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                {/* Time selector */}
                <div className="md:col-span-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Giờ nhắc nhở:</label>
                  <div className="relative">
                    <input 
                      type="time" 
                      required
                      value={inputTime}
                      onChange={(e) => setInputTime(e.target.value)}
                      className="w-full bg-white text-slate-800 font-bold border border-slate-200 rounded-xl px-4 py-3 text-lg text-center focus:border-emerald-500 outline-none focus:ring-1 focus:ring-emerald-500 tracking-wider transition-all shadow-sm"
                    />
                  </div>
                </div>

                {/* Medicine text field */}
                <div className="md:col-span-5">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tên vị thuốc / Nhãn ghi chú:</label>
                  <input 
                    type="text"
                    required
                    placeholder="VD: Thuốc mỡ máu, Panadol..."
                    value={inputLabel}
                    onChange={(e) => setInputLabel(e.target.value)}
                    className="w-full bg-white text-slate-850 font-medium border border-slate-200 rounded-xl px-4 py-3.5 text-sm focus:border-emerald-500 outline-none focus:ring-1 focus:ring-emerald-500 transition-all placeholder-slate-400 shadow-sm"
                  />
                </div>

                {/* Physical box Compartment slot selector */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Ngăn thuốc:</label>
                  <select
                    value={inputSlot}
                    onChange={(e) => setInputSlot(parseInt(e.target.value))}
                    className="w-full bg-white text-slate-700 font-semibold border border-slate-200 rounded-xl px-3 py-3.5 text-sm focus:border-emerald-500 outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm"
                  >
                    <option value={1}>Ngăn 1 (Sáng)</option>
                    <option value={2}>Ngăn 2 (Trưa)</option>
                    <option value={3}>Ngăn 3 (Tối)</option>
                  </select>
                </div>

                {/* Form submit button */}
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-105 hover:shadow text-white font-bold text-sm rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" /> Lưu Lịch
                  </button>
                </div>
              </div>

              {/* Quick Preset Labels Selector */}
              <div className="mt-4 pt-4 border-t border-slate-200">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Lời khuyên nhanh từ hệ thống khuyến nghị:</span>
                <div className="flex flex-wrap gap-2">
                  {suggestedPills.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setInputLabel(p.label);
                        setInputSlot(p.slot);
                      }}
                      className="text-xs px-2.5 py-1 bg-white hover:bg-slate-100 hover:text-emerald-700 border border-slate-205 text-slate-600 rounded-lg transition-all font-semibold shadow-sm cursor-pointer"
                    >
                      {p.label} (Khay {p.slot})
                    </button>
                  ))}
                </div>
              </div>
            </form>

            {/* List of Scheduled Remedies Table */}
            <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] md:text-xs uppercase font-extrabold text-slate-500 tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4 text-center w-12 text-slate-400"># STT</th>
                    <th className="py-3 px-3">Thời gian uống</th>
                    <th className="py-3 px-3">Vị Thuốc & Liều dùng</th>
                    <th className="py-3 px-3 text-center">Ngăn chứa</th>
                    <th className="py-3 px-3">Trạng thái</th>
                    <th className="py-3 px-4 text-center w-16">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {status && status.reminders.length > 0 ? (
                    status.reminders.map((reminder, i) => {
                      const hh = String(reminder.h).padStart(2, '0');
                      const mm = String(reminder.m).padStart(2, '0');
                      const isTargetHighlight = status.active_slot === reminder.slot && isAlarming;

                      return (
                        <tr 
                          key={reminder.id}
                          className={`hover:bg-slate-50/50 transition-all ${isTargetHighlight ? 'bg-red-50/40' : ''}`}
                        >
                          <td className="py-3.5 px-4 text-center text-xs font-mono font-bold text-slate-400">
                            #{i + 1}
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="font-mono text-base font-extrabold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                              {hh}:{mm}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="font-bold text-slate-750">{reminder.label}</div>
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-650">
                              Ngăn {reminder.slot}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            {reminder.taken ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Đã uống gọn
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-bold bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-550 animate-pulse" />
                                Chờ nhắc nhở
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleDeleteReminder(i, reminder.label)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              title="Hủy lịch cữ này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 px-4 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <AlertTriangle className="w-10 h-10 text-slate-350 mb-3 animate-pulse" />
                          <p className="text-sm font-semibold">Chưa có lịch nhắc nhở cữ thuốc nào trên thiết bị.</p>
                          <p className="text-xs text-slate-500 mt-1">Sử dụng thanh công cụ bên trên để thêm cữ nhắc nhanh chóng!</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {status && status.reminders.length > 0 && (
              <div className="flex justify-end mt-4 animate-fade-in">
                <button
                  onClick={handleClearAll}
                  className={`text-xs px-4 py-2.5 border rounded-xl transition-all font-bold flex items-center gap-1.5 ${
                    isConfirmingClear 
                      ? 'bg-red-500 text-white border-red-500 animate-pulse active:scale-95' 
                      : 'text-red-600 hover:text-red-500 hover:bg-red-50 hover:border-red-300 bg-red-50/50 border-red-200 active:scale-95'
                  }`}
                  title={isConfirmingClear ? "Bấm lần nữa để xác nhận xóa hết" : "Xóa hoàn toàn lịch cữ uống hôm nay"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isConfirmingClear ? 'Bấm để xác nhận XÓA SẠCH!' : 'Xóa sạch tất cả lịch nhắc'}
                </button>
              </div>
            )}
          </div>

          {/* Block: Real-time Device Activity Logs Header */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h2 className="font-display font-bold text-slate-800 text-base flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-indigo-650" />
              Nhật Kí Thiết Bị & Sự Kiện Log Hôm Nay
            </h2>

            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {status && status.logs.length > 0 ? (
                status.logs.map((log) => {
                  let badgeColor = "bg-slate-50 text-slate-500 border-slate-200";
                  
                  if (log.action === "Đã uống") {
                    badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-250/60";
                  } else if (log.action === "Đã thiết lập cữ") {
                    badgeColor = "bg-blue-50 text-blue-700 border-blue-250/60";
                  } else if (log.action === "Tháo dỡ cữ") {
                    badgeColor = "bg-red-50 text-red-700 border-red-250/60";
                  } else if (log.action === "Xóa sạch lịch") {
                    badgeColor = "bg-amber-50 text-amber-700 border-amber-250";
                  }

                  return (
                    <div 
                      key={log.id}
                      className="bg-slate-50/50 p-3 rounded-lg border border-slate-150 flex items-center justify-between gap-4 text-xs hover:border-slate-300 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold border ${badgeColor}`}>
                          {log.action}
                        </span>
                        <div className="font-bold text-slate-700">
                          {log.label} <span className="text-slate-400 text-[10px] font-semibold">(Ngăn {log.slot})</span>
                        </div>
                      </div>

                      <div className="text-[10px] font-mono text-slate-500 font-bold">
                        {formatTimeAgo(log.time)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs font-semibold">
                  Không tìm thấy hoạt động sự kiện cũ nào. Ghi chú log sẽ hiển thị ở đây khi bạn thực hiện tác vụ dữ liệu.
                </div>
              )}
            </div>
          </div>

          {/* Cẩm Nang Hướng Dẫn Kết Nối ESP32 & Khắc Phục Sự Cố */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-6 border border-slate-800 text-white shadow-xl relative overflow-hidden animate-fade-in mb-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
            
            <div className="space-y-4 text-xs">
              {/* Feature note: Data saved permanently */}
              <div className="bg-emerald-950/45 border border-emerald-800/40 rounded-xl p-4 text-emerald-300 font-sans">
                <span className="font-bold flex items-center gap-1.5 mb-1 text-sm">
                  <Check className="w-4 h-4 text-emerald-400" />
                  Giao Thức Đồng Bộ MQTT Siêu Tốc (Mới)
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  Hệ thống đã chuyển sang sử dụng giao thức <strong className="text-emerald-400 font-bold">MQTT</strong> thông qua Broker công cộng <code className="bg-emerald-990 text-emerald-300 px-1 py-0.5 rounded font-mono font-bold">broker.hivemq.com</code>. Nhờ đó, mọi thao tác đổi cữ trên Web hay bấm nút trên ESP32 sẽ được kích hoạt tức thì dưới 100ms! data.json vẫn đồng bộ vĩnh viễn trên máy chủ.
                </p>
              </div>

              {/* Guide steps */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-bold flex items-center gap-1.5 mb-2 text-indigo-300">
                    <span className="w-5 h-5 rounded-full bg-indigo-900/80 text-center font-mono inline-flex items-center justify-center text-[10px]">1</span>
                    Cấu Hình MQTT Broker &amp; Port
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3 font-sans">
                    Trong code Arduino của ESP32, sử dụng các tham số kết nối MQTT sau:
                    <br />
                    • Broker Address: <code className="bg-slate-800 text-amber-300 px-1 py-0.5 rounded font-mono font-bold">"broker.hivemq.com"</code>
                    <br />
                    • Port kết nối: <code className="bg-slate-800 text-amber-300 px-1 py-0.5 rounded font-mono font-bold">1883</code> (TCP)
                  </p>
                </div>

                <div>
                  <h4 className="font-bold flex items-center gap-1.5 mb-2 text-indigo-300">
                    <span className="w-5 h-5 rounded-full bg-indigo-900/80 text-center font-mono inline-flex items-center justify-center text-[10px]">2</span>
                    Danh sách các Topic Đăng ký/Gửi tin
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                    Sử dụng mã nhận dạng của thiết bị của bạn để đăng ký nhận/gửi tín hiệu:
                    <br />
                    • Đăng ký nhận lịch: <code className="bg-slate-800 text-emerald-400 px-1 py-0.5 rounded font-mono">medbox/9240bc0f/reminders</code>
                    <br />
                    • Đăng ký kiểm soát LED/Còi: <code className="bg-slate-800 text-emerald-400 px-1 py-0.5 rounded font-mono">medbox/9240bc0f/control</code>
                    <br />
                    • Gửi hành động khi nhấn OK: <code className="bg-slate-800 text-amber-300 px-1 py-0.5 rounded font-mono">medbox/9240bc0f/action</code> (Payload: <code className="font-mono text-slate-350">{"{\"action\":\"taken\"}"}</code>)
                  </p>
                </div>
              </div>

              {/* Troubleshooting debug indicators */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
                <span className="block font-bold text-amber-400 mb-1.5 flex items-center gap-1.5 font-sans">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Hướng dẫn gỡ lỗi lắp đặt phần cứng &amp; Buzzer:
                </span>
                <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-400 leading-relaxed font-sans">
                  <li>
                    <strong className="text-slate-300">Buzzer không reo:</strong> Còi chíp Buzzer hoạt động ở điện áp 3.3V-5V. Hãy kiểm tra xem bạn đã đấu cực dương (+) vào chân <code className="text-emerald-400 font-mono">GPIO 32</code> và cực âm (-) vào chân <code className="text-emerald-400 font-mono">GND</code> chưa.
                  </li>
                  <li>
                    <strong className="text-slate-300">Trạng thái Còi Hú Buzzer từ xa:</strong> Khi bật/tắt nút thử nghiệm Còi reo trên Web, tín hiệu MQTT sẽ lập tức gửi lệnh có thuộc tính <code className="text-emerald-400 font-mono">"buzzer_state": 1</code> tới ESP32 để kích hoạt còi chíp.
                  </li>
                  <li>
                    <strong className="text-slate-300">Thành phần thư viện:</strong> Đừng quên cài đặt thư viện <code className="text-amber-400 font-mono">PubSubClient</code> (bởi Nick O'Leary) thông qua Library Manager trên Arduino IDE để hỗ trợ giao tiếp MQTT mượt mà!
                  </li>
                </ul>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Footer system details */}
      <footer className="text-center text-xs text-slate-500 py-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span>Hệ Thống Thiết Bị Nhắc Thuốc IoT Đột Phá - MedBox Smart Solution © 2026</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="font-semibold text-slate-600">Sẵn sàng kết nối thiết bị ngoại vi</span>
        </div>
      </footer>
    </div>
  );
}
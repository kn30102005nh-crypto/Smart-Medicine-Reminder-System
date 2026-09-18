export interface Reminder {
  id: number;
  h: number;
  m: number;
  taken: boolean;
  label: string;
  slot: number; // 1, 2, or 3 representing physical box compartments
}

export interface LogEntry {
  id: number;
  time: string;
  label: string;
  action: string; // e.g., "Đã uống", "Đã thiết lập cữ", "Tháo dỡ cữ", "Xóa sạch lịch"
  slot: number;
}

export interface MedBoxStatus {
  rtc_time: string;
  rtc_date: string;
  rem_count: number;
  led_state: number; // 1 or 0
  buzzer_state: number; // 1 or 0
  active_slot: number; // 0, 1, 2, or 3
  reminders: Reminder[];
  logs: LogEntry[];
  simulation_hour: number | null;
}

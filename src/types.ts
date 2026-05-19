export interface Staff {
  id: string;
  name: string;
  active: boolean;
  color: string;
}

export interface Appointment {
  id: string;
  date: string;
  staffId: string;
  startTime: string;
  durationMinutes: number;
  durationSlots?: number;
  customerName: string;
  phone: string;
  service: string;
  price: number;
  note?: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export type CurrencyCode = "CNY" | "EUR" | "USD" | "GBP";
export type IncomeDisplayMode = "showAll" | "hideScheduleSummary" | "hideAllReadOnly";

export interface Settings {
  businessStart: string;
  businessEnd: string;
  currencyCode: CurrencyCode;
  customerMemoryEnabled: boolean;
  incomeDisplayMode: IncomeDisplayMode;
  slotMinutes: number;
}

export interface SalonData {
  staff: Staff[];
  appointments: Appointment[];
  services: ServiceItem[];
  settings: Settings;
}

export type AppTab = "schedule" | "staff" | "ledger" | "settings";

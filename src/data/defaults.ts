import type { Appointment, ServiceItem, Settings, Staff } from "../types";

export const staffPalette = ["#F45B8A", "#20B2AA", "#E4A83D", "#9A77D6", "#62B67A", "#5A7BD8"];

export const defaultSettings: Settings = {
  businessStart: "09:00",
  businessEnd: "21:00",
  currencyCode: "CNY",
  customerMemoryEnabled: true,
  incomeDisplayMode: "showAll",
  slotMinutes: 30,
};

export const defaultStaff: Staff[] = [
  { id: "staff-xiaomei", name: "小美", active: true, color: staffPalette[0] },
  { id: "staff-shadachun", name: "傻大春", active: true, color: staffPalette[1] },
  { id: "staff-xiaotian", name: "小甜", active: true, color: staffPalette[2] },
];

export const defaultServices: ServiceItem[] = [
  { id: "service-nail-extend", name: "美甲(延长)", price: 198, durationMinutes: 90 },
  { id: "service-nail-solid", name: "美甲(单色)", price: 128, durationMinutes: 60 },
  { id: "service-lash-natural", name: "美睫(自然款)", price: 228, durationMinutes: 60 },
  { id: "service-lash-volume", name: "美睫(浓密款)", price: 298, durationMinutes: 90 },
  { id: "service-facial", name: "美容护理", price: 398, durationMinutes: 90 },
  { id: "service-hand-care", name: "手部护理", price: 88, durationMinutes: 30 },
];

export const serviceSuggestions = defaultServices.map((service) => service.name);

export const createSeedAppointments = (_date: string): Appointment[] => [];

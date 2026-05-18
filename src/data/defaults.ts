import type { Appointment, ServiceItem, Settings, Staff } from "../types";

export const staffPalette = ["#F45B8A", "#20B2AA", "#E4A83D", "#9A77D6", "#62B67A", "#5A7BD8"];

export const defaultSettings: Settings = {
  businessStart: "09:00",
  businessEnd: "21:00",
  currencyCode: "CNY",
  slotMinutes: 30,
};

export const defaultStaff: Staff[] = [
  { id: "staff-zhang", name: "张美丽", active: true, color: staffPalette[0] },
  { id: "staff-li", name: "李婷婷", active: true, color: staffPalette[1] },
  { id: "staff-wang", name: "王小雨", active: true, color: staffPalette[2] },
  { id: "staff-liu", name: "刘佳佳", active: true, color: staffPalette[3] },
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

export const createSeedAppointments = (date: string): Appointment[] => [
  {
    id: "appt-seed-1",
    date,
    staffId: "staff-zhang",
    startTime: "09:00",
    durationMinutes: 90,
    customerName: "王女士",
    phone: "138 8888 8888",
    service: "美甲(延长)",
    price: 198,
  },
  {
    id: "appt-seed-2",
    date,
    staffId: "staff-li",
    startTime: "10:00",
    durationMinutes: 60,
    customerName: "孙女士",
    phone: "139 6666 6688",
    service: "美睫(自然款)",
    price: 228,
  },
  {
    id: "appt-seed-3",
    date,
    staffId: "staff-wang",
    startTime: "10:30",
    durationMinutes: 90,
    customerName: "李女士",
    phone: "136 7777 7777",
    service: "美容护理",
    price: 398,
  },
  {
    id: "appt-seed-4",
    date,
    staffId: "staff-liu",
    startTime: "13:30",
    durationMinutes: 60,
    customerName: "杨小姐",
    phone: "135 1234 5678",
    service: "美甲(单色)",
    price: 128,
  },
];

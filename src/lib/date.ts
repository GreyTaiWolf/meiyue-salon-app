import type { CurrencyCode } from "../types";

export const toDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const todayISO = (): string => toDateInputValue(new Date());

export const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
};

export const formatDateTitle = (isoDate: string): string => {
  const date = new Date(`${isoDate}T00:00:00`);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
  const today = todayISO();
  const relative = isoDate === today ? "今天" : isoDate === addDays(today, 1) ? "明天" : isoDate === addDays(today, -1) ? "昨天" : "";
  return `${isoDate} ${relative} ${weekday}`.replace(/\s+/g, " ").trim();
};

export const formatWeekday = (isoDate: string): string =>
  new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(new Date(`${isoDate}T00:00:00`));

export const formatCurrency = (amount: number, currencyCode: CurrencyCode): string =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

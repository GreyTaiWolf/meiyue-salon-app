import type { Appointment, Settings, Staff } from "../types";

export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

export const createTimeSlots = (start: string, end: string, slotMinutes: number): string[] => {
  const slots: string[] = [];
  for (let cursor = timeToMinutes(start); cursor < timeToMinutes(end); cursor += slotMinutes) {
    slots.push(minutesToTime(cursor));
  }
  return slots;
};

export const getAppointmentDurationMinutes = (appointment: Appointment): number =>
  appointment.durationMinutes ?? Math.max(1, appointment.durationSlots ?? 1) * 30;

export const appointmentEndTime = (appointment: Appointment, settings: Settings): string =>
  minutesToTime(timeToMinutes(appointment.startTime) + getAppointmentDurationMinutes(appointment));

export const isAppointmentInBounds = (appointment: Appointment, settings: Settings): boolean => {
  const start = timeToMinutes(appointment.startTime);
  const end = start + getAppointmentDurationMinutes(appointment);
  return start >= timeToMinutes(settings.businessStart) && end <= timeToMinutes(settings.businessEnd);
};

export const appointmentsOverlap = (a: Appointment, b: Appointment, settings: Settings): boolean => {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = aStart + getAppointmentDurationMinutes(a);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = bStart + getAppointmentDurationMinutes(b);
  return a.date === b.date && a.staffId === b.staffId && a.id !== b.id && aStart < bEnd && aEnd > bStart;
};

export const findConflicts = (appointment: Appointment, appointments: Appointment[], settings: Settings): Appointment[] =>
  appointments.filter((candidate) => appointmentsOverlap(appointment, candidate, settings));

export const getAppointmentsForDate = (appointments: Appointment[], date: string): Appointment[] =>
  appointments
    .filter((appointment) => appointment.date === date)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

export const getStaffById = (staff: Staff[], staffId: string): Staff | undefined =>
  staff.find((person) => person.id === staffId);

export const colorWithAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export const getStaffTotals = (staff: Staff[], appointments: Appointment[]) =>
  staff.map((person) => {
    const personAppointments = appointments.filter((appointment) => appointment.staffId === person.id);
    return {
      staff: person,
      count: personAppointments.length,
      income: personAppointments.reduce((sum, appointment) => sum + appointment.price, 0),
    };
  });

export const createClockOptions = (): string[] => {
  const options: string[] = [];
  for (let cursor = 7 * 60; cursor <= 23 * 60; cursor += 15) {
    options.push(minutesToTime(cursor));
  }
  return options;
};

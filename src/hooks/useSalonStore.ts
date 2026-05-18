import { useCallback, useEffect, useMemo, useState } from "react";
import { staffPalette } from "../data/defaults";
import {
  deleteAppointmentRecord,
  deleteServiceRecord,
  deleteStaffRecord,
  loadSalonData,
  putSettings,
  saveAppointmentRecord,
  saveServiceRecord,
  saveStaffRecord,
} from "../lib/db";
import type { Appointment, ServiceItem, Settings, Staff } from "../types";

const createId = (prefix: string): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const useSalonStore = () => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [settings, setSettings] = useState<Settings>({
    businessStart: "09:00",
    businessEnd: "21:00",
    currencyCode: "CNY",
    slotMinutes: 30,
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    loadSalonData()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setStaff(data.staff);
        setAppointments(data.appointments);
        setServices(data.services);
        setSettings(data.settings);
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (cancelled) {
          return;
        }
        setError(reason instanceof Error ? reason.message : "本机数据库打开失败");
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeStaff = useMemo(() => staff.filter((person) => person.active), [staff]);

  const addStaff = useCallback(
    async (name: string) => {
      const nextStaff: Staff = {
        id: createId("staff"),
        name,
        active: true,
        color: staffPalette[staff.length % staffPalette.length],
      };
      await saveStaffRecord(nextStaff);
      setStaff((current) => [...current, nextStaff]);
    },
    [staff.length],
  );

  const updateStaff = useCallback(
    async (id: string, patch: Partial<Omit<Staff, "id">>) => {
      const existing = staff.find((person) => person.id === id);
      if (!existing) {
        return;
      }

      const nextRecord = { ...existing, ...patch };
      await saveStaffRecord(nextRecord);
      setStaff((current) => current.map((person) => (person.id === id ? nextRecord : person)));
    },
    [staff],
  );

  const deleteStaff = useCallback(
    async (id: string): Promise<"deleted" | "deactivated" | "missing"> => {
      const existing = staff.find((person) => person.id === id);
      if (!existing) {
        return "missing";
      }

      const hasAppointments = appointments.some((appointment) => appointment.staffId === id);
      if (hasAppointments) {
        const nextRecord = { ...existing, active: false };
        await saveStaffRecord(nextRecord);
        setStaff((current) => current.map((person) => (person.id === id ? nextRecord : person)));
        return "deactivated";
      }

      await deleteStaffRecord(id);
      setStaff((current) => current.filter((person) => person.id !== id));
      return "deleted";
    },
    [appointments, staff],
  );

  const saveAppointment = useCallback(async (appointment: Appointment) => {
    const nextAppointment = { ...appointment, durationMinutes: appointment.durationMinutes ?? Math.max(1, appointment.durationSlots ?? 1) * 30 };
    await saveAppointmentRecord(nextAppointment);
    setAppointments((current) => {
      const existing = current.some((item) => item.id === nextAppointment.id);
      if (existing) {
        return current.map((item) => (item.id === nextAppointment.id ? nextAppointment : item));
      }
      return [...current, nextAppointment];
    });
  }, []);

  const deleteAppointment = useCallback(async (appointmentId: string) => {
    await deleteAppointmentRecord(appointmentId);
    setAppointments((current) => current.filter((appointment) => appointment.id !== appointmentId));
  }, []);

  const saveSettings = useCallback(async (nextSettings: Settings) => {
    await putSettings(nextSettings);
    setSettings(nextSettings);
  }, []);

  const addService = useCallback(async (service: Omit<ServiceItem, "id">) => {
    const nextService: ServiceItem = {
      ...service,
      id: createId("service"),
      name: service.name.trim(),
    };
    await saveServiceRecord(nextService);
    setServices((current) => [...current, nextService]);
  }, []);

  const updateService = useCallback(
    async (id: string, patch: Partial<Omit<ServiceItem, "id">>) => {
      const existing = services.find((service) => service.id === id);
      if (!existing) {
        return;
      }

      const nextRecord = { ...existing, ...patch, name: patch.name?.trim() ?? existing.name };
      await saveServiceRecord(nextRecord);
      setServices((current) => current.map((service) => (service.id === id ? nextRecord : service)));
    },
    [services],
  );

  const deleteService = useCallback(async (id: string) => {
    await deleteServiceRecord(id);
    setServices((current) => current.filter((service) => service.id !== id));
  }, []);

  const createAppointment = useCallback(
    (date: string, staffId: string, startTime: string): Appointment => ({
      id: createId("appt"),
      date,
      staffId,
      startTime,
      durationMinutes: 60,
      customerName: "",
      phone: "",
      service: "",
      price: 0,
      note: "",
    }),
    [],
  );

  return {
    activeStaff,
    addStaff,
    addService,
    appointments,
    createAppointment,
    deleteAppointment,
    deleteService,
    deleteStaff,
    error,
    ready,
    saveAppointment,
    saveSettings,
    settings,
    services,
    staff,
    updateService,
    updateStaff,
  };
};

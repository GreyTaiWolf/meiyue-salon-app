import { createSeedAppointments, defaultServices, defaultSettings, defaultStaff } from "../data/defaults";
import { todayISO } from "./date";
import type { Appointment, SalonData, ServiceItem, Settings, Staff } from "../types";

const DB_NAME = "meiyue-salon-db";
const DB_VERSION = 2;
const STAFF_STORE = "staff";
const APPOINTMENT_STORE = "appointments";
const SERVICE_STORE = "services";
const SETTINGS_STORE = "settings";
const SETTINGS_KEY = "main";

let databasePromise: Promise<IDBDatabase> | undefined;

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STAFF_STORE)) {
        db.createObjectStore(STAFF_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(APPOINTMENT_STORE)) {
        const store = db.createObjectStore(APPOINTMENT_STORE, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("staffId", "staffId", { unique: false });
      }

      if (!db.objectStoreNames.contains(SERVICE_STORE)) {
        db.createObjectStore(SERVICE_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return databasePromise;
};

const getAll = async <T>(storeName: string): Promise<T[]> => {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  return requestToPromise<T[]>(transaction.objectStore(storeName).getAll());
};

const putItem = async <T>(storeName: string, item: T): Promise<void> => {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(item);
  await transactionDone(transaction);
};

const deleteItem = async (storeName: string, key: string): Promise<void> => {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
};

export const getSettings = async (): Promise<Settings | undefined> => {
  const db = await openDatabase();
  const transaction = db.transaction(SETTINGS_STORE, "readonly");
  return requestToPromise<Settings | undefined>(transaction.objectStore(SETTINGS_STORE).get(SETTINGS_KEY));
};

export const putSettings = async (settings: Settings): Promise<void> => {
  const db = await openDatabase();
  const transaction = db.transaction(SETTINGS_STORE, "readwrite");
  transaction.objectStore(SETTINGS_STORE).put(settings, SETTINGS_KEY);
  await transactionDone(transaction);
};

const normalizeAppointment = (appointment: Appointment): Appointment => {
  const legacyAppointment = appointment as Appointment & { durationMinutes?: number; durationSlots?: number };
  const durationMinutes = legacyAppointment.durationMinutes ?? Math.max(1, legacyAppointment.durationSlots ?? 1) * 30;

  return {
    ...appointment,
    durationMinutes,
  };
};

const normalizeSettings = (settings: Settings | undefined): Settings | undefined => {
  if (!settings) {
    return undefined;
  }

  return {
    ...defaultSettings,
    ...settings,
    currencyCode: settings.currencyCode ?? defaultSettings.currencyCode,
    incomeDisplayMode: settings.incomeDisplayMode ?? defaultSettings.incomeDisplayMode,
  };
};

export const loadSalonData = async (): Promise<SalonData> => {
  const [staff, appointments, services, settings] = await Promise.all([
    getAll<Staff>(STAFF_STORE),
    getAll<Appointment>(APPOINTMENT_STORE),
    getAll<ServiceItem>(SERVICE_STORE),
    getSettings(),
  ]);

  let nextStaff = staff;
  let nextAppointments = appointments.map(normalizeAppointment);
  let nextServices = services;
  let nextSettings = normalizeSettings(settings);

  if (nextStaff.length === 0) {
    await Promise.all(defaultStaff.map((person) => putItem(STAFF_STORE, person)));
    nextStaff = defaultStaff;
  }

  if (nextAppointments.length === 0) {
    const seededAppointments = createSeedAppointments(todayISO());
    await Promise.all(seededAppointments.map((appointment) => putItem(APPOINTMENT_STORE, appointment)));
    nextAppointments = seededAppointments;
  } else if (appointments.some((appointment) => !("durationMinutes" in appointment))) {
    await Promise.all(nextAppointments.map((appointment) => putItem(APPOINTMENT_STORE, appointment)));
  }

  if (nextServices.length === 0) {
    await Promise.all(defaultServices.map((service) => putItem(SERVICE_STORE, service)));
    nextServices = defaultServices;
  }

  if (!nextSettings) {
    await putSettings(defaultSettings);
    nextSettings = defaultSettings;
  } else if (!settings?.currencyCode || !settings?.incomeDisplayMode) {
    await putSettings(nextSettings);
  }

  return {
    staff: nextStaff,
    appointments: nextAppointments,
    services: nextServices,
    settings: nextSettings,
  };
};

export const saveStaffRecord = (staff: Staff): Promise<void> => putItem(STAFF_STORE, staff);

export const deleteStaffRecord = (staffId: string): Promise<void> => deleteItem(STAFF_STORE, staffId);

export const saveAppointmentRecord = (appointment: Appointment): Promise<void> =>
  putItem(APPOINTMENT_STORE, appointment);

export const deleteAppointmentRecord = (appointmentId: string): Promise<void> =>
  deleteItem(APPOINTMENT_STORE, appointmentId);

export const saveServiceRecord = (service: ServiceItem): Promise<void> => putItem(SERVICE_STORE, service);

export const deleteServiceRecord = (serviceId: string): Promise<void> => deleteItem(SERVICE_STORE, serviceId);

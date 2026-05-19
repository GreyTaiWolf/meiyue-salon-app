import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock3,
  NotebookTabs,
  Plus,
  Settings2,
  Trash2,
  UsersRound,
  WalletCards,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSalonStore } from "./hooks/useSalonStore";
import { addDays, formatCurrency, formatDateTitle, formatWeekday, todayISO } from "./lib/date";
import {
  appointmentEndTime,
  colorWithAlpha,
  createClockOptions,
  createTimeSlots,
  findConflicts,
  getAppointmentDurationMinutes,
  getAppointmentsForDate,
  getStaffById,
  getStaffTotals,
  isAppointmentInBounds,
  timeToMinutes,
} from "./lib/schedule";
import type { AppTab, Appointment, CurrencyCode, IncomeDisplayMode, ServiceItem, Settings, Staff } from "./types";

const durationOptions = [
  { minutes: 10, label: "10分钟" },
  { minutes: 15, label: "15分钟" },
  { minutes: 30, label: "30分钟" },
  { minutes: 45, label: "45分钟" },
  { minutes: 60, label: "1小时" },
  { minutes: 90, label: "1.5小时" },
  { minutes: 120, label: "2小时" },
  { minutes: 150, label: "2.5小时" },
  { minutes: 180, label: "3小时" },
];

const slotIntervalOptions = [
  { minutes: 10, label: "10分钟" },
  { minutes: 15, label: "15分钟" },
  { minutes: 30, label: "30分钟" },
];

const currencyOptions: Array<{ code: CurrencyCode; label: string }> = [
  { code: "CNY", label: "人民币 (¥)" },
  { code: "EUR", label: "欧元 (€)" },
  { code: "USD", label: "美元 ($)" },
  { code: "GBP", label: "英镑 (£)" },
];

const incomeDisplayOptions: Array<{ mode: IncomeDisplayMode; label: string }> = [
  { mode: "showAll", label: "全部显示" },
  { mode: "hideScheduleSummary", label: "部分隐藏：首页收入" },
  { mode: "hideAllReadOnly", label: "全部隐藏：只读金额" },
];

const tabItems: Array<{ id: AppTab; label: string; icon: typeof CalendarDays }> = [
  { id: "schedule", label: "预约", icon: CalendarDays },
  { id: "staff", label: "员工", icon: UsersRound },
  { id: "ledger", label: "账本", icon: NotebookTabs },
  { id: "settings", label: "设置", icon: Settings2 },
];

const staffInitial = (name: string): string => name.trim().slice(0, 1) || "员";

const parseISODate = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const dateToISO = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const addMonths = (value: string, offset: number): string => {
  const date = parseISODate(value);
  date.setMonth(date.getMonth() + offset, 1);
  return dateToISO(date);
};

const getCalendarDays = (monthValue: string): Date[] => {
  const month = parseISODate(monthValue);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const next = new Date(cursor);
    next.setDate(cursor.getDate() + index);
    return next;
  });
};

const formatCalendarMonth = (value: string): string => {
  const date = parseISODate(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
};

const durationLabel = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes}分钟`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}小时`;
  }
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`;
};

interface CustomerMemoryRecord {
  key: string;
  lastSeen: string;
  name: string;
  phone: string;
}

const normalizeMemoryText = (value: string): string => value.trim().toLowerCase();

const normalizePhoneDigits = (value: string): string => value.replace(/\D/g, "");

const appointmentMemoryStamp = (appointment: Appointment): string => `${appointment.date} ${appointment.startTime}`;

const buildCustomerMemory = (appointments: Appointment[]): CustomerMemoryRecord[] => {
  const records = new Map<string, CustomerMemoryRecord>();
  const sortedAppointments = [...appointments].sort((a, b) => appointmentMemoryStamp(b).localeCompare(appointmentMemoryStamp(a)));

  sortedAppointments.forEach((appointment) => {
    const name = appointment.customerName.trim();
    const phone = appointment.phone.trim();
    if (!name && !phone) {
      return;
    }

    const phoneDigits = normalizePhoneDigits(phone);
    const key = phoneDigits ? `phone:${phoneDigits}` : `name:${normalizeMemoryText(name)}`;
    if (records.has(key)) {
      return;
    }

    records.set(key, {
      key,
      lastSeen: appointment.date,
      name,
      phone,
    });
  });

  return Array.from(records.values()).slice(0, 120);
};

type AppBackHandler = () => void;

let appBackHandlerId = 0;
const appBackHandlers: Array<{ handler: AppBackHandler; id: number }> = [];

const registerAppBackHandler = (handler: AppBackHandler): (() => void) => {
  const entry = { handler, id: ++appBackHandlerId };
  appBackHandlers.push(entry);

  return () => {
    const index = appBackHandlers.findIndex((candidate) => candidate.id === entry.id);
    if (index >= 0) {
      appBackHandlers.splice(index, 1);
    }
  };
};

const runLatestAppBackHandler = (): boolean => {
  const latest = appBackHandlers[appBackHandlers.length - 1];
  if (!latest) {
    return false;
  }

  latest.handler();
  return true;
};

const useAppBackHandler = (enabled: boolean, handler: AppBackHandler) => {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    return registerAppBackHandler(handler);
  }, [enabled, handler]);
};

type SelectOptionValue = string | number;

interface SelectSheetOption<Value extends SelectOptionValue> {
  description?: string;
  label: string;
  value: Value;
}

interface SelectSheetFieldProps<Value extends SelectOptionValue> {
  className?: string;
  compact?: boolean;
  label: string;
  onChange: (value: Value) => void;
  options: Array<SelectSheetOption<Value>>;
  title?: string;
  value: Value;
}

const SelectSheetField = <Value extends SelectOptionValue>({
  className,
  compact = false,
  label,
  onChange,
  options,
  title,
  value,
}: SelectSheetFieldProps<Value>) => {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useAppBackHandler(open, () => setOpen(false));

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => {
      selectedRef.current?.scrollIntoView({ block: "center" });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, value]);

  return (
    <div className={`select-sheet-field ${compact ? "compact-select" : ""} ${className ?? ""}`.trim()}>
      <span className={compact ? "visually-hidden" : ""}>{label}</span>
      <button
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="select-sheet-trigger"
        type="button"
        onClick={() => setOpen(true)}
      >
        <span>{selectedOption?.label ?? "请选择"}</span>
        <ChevronDown size={17} />
      </button>
      {open ? (
        <div className="select-sheet-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setOpen(false)}>
          <section className="select-sheet" role="dialog" aria-modal="true" aria-label={title ?? label}>
            <div className="select-sheet-handle" />
            <header className="select-sheet-header">
              <h2>{title ?? label}</h2>
              <button className="secondary-button" type="button" onClick={() => setOpen(false)}>
                关闭
              </button>
            </header>
            <div className="select-sheet-options" role="listbox" aria-label={title ?? label}>
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    aria-selected={selected}
                    className="select-sheet-option"
                    key={String(option.value)}
                    ref={selected ? selectedRef : undefined}
                    role="option"
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span>
                      <strong>{option.label}</strong>
                      {option.description ? <small>{option.description}</small> : null}
                    </span>
                    {selected ? <Check size={17} /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

const App = () => {
  const {
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
    services,
    settings,
    staff,
    updateService,
    updateStaff,
  } = useSalonStore();
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [activeTab, setActiveTab] = useState<AppTab>("schedule");
  const [editingAppointment, setEditingAppointment] = useState<Appointment | undefined>();
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [viewingStaffId, setViewingStaffId] = useState<string | undefined>();
  const [pendingConflict, setPendingConflict] = useState<{ appointment: Appointment; conflicts: Appointment[] } | undefined>();
  const [appointmentDrafts, setAppointmentDrafts] = useState<Record<string, Appointment>>({});
  const [showExitDialog, setShowExitDialog] = useState(false);

  const dateAppointments = useMemo(
    () => getAppointmentsForDate(appointments, selectedDate),
    [appointments, selectedDate],
  );
  const customerMemory = useMemo(() => buildCustomerMemory(appointments), [appointments]);
  const income = useMemo(
    () => dateAppointments.reduce((sum, appointment) => sum + appointment.price, 0),
    [dateAppointments],
  );
  const currentToday = todayISO(currentDateTime);
  const hideScheduleIncome = settings.incomeDisplayMode !== "showAll";
  const dateStatusLabel = selectedDate === currentToday ? "今天" : formatWeekday(selectedDate);
  const firstActiveStaffId = activeStaff[0]?.id ?? staff[0]?.id ?? "";
  const viewingStaff = viewingStaffId ? staff.find((person) => person.id === viewingStaffId) : undefined;
  const handleAppBack = useCallback(() => {
    if (!runLatestAppBackHandler()) {
      setShowExitDialog(true);
    }
  }, []);

  useAppBackHandler(showExitDialog, () => setShowExitDialog(false));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let active = true;
    let listener: { remove: () => Promise<void> } | undefined;

    void CapacitorApp.addListener("backButton", () => {
      handleAppBack();
    }).then((handle) => {
      if (active) {
        listener = handle;
      } else {
        void handle.remove();
      }
    });

    return () => {
      active = false;
      void listener?.remove();
    };
  }, [handleAppBack]);

  useEffect(() => {
    const guardState = { meiyueBackGuard: true };
    window.history.pushState(guardState, "", window.location.href);

    const handlePopState = () => {
      handleAppBack();
      window.history.pushState(guardState, "", window.location.href);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handleAppBack]);

  const getDraftKey = (date: string, staffId: string, startTime: string) => `${date}::${staffId}::${startTime}`;

  const openNewAppointment = (staffId = firstActiveStaffId, startTime = settings.businessStart) => {
    if (!staffId) {
      setActiveTab("staff");
      return;
    }
    const draftKey = getDraftKey(selectedDate, staffId, startTime);
    const savedDraft = appointmentDrafts[draftKey];
    setEditingAppointment(savedDraft ?? createAppointment(selectedDate, staffId, startTime));
  };

  const handleSaveAppointment = async (appointment: Appointment) => {
    if (!isAppointmentInBounds(appointment, settings)) {
      window.alert("预约时间需要在营业时间内。");
      return;
    }

    const conflicts = findConflicts(appointment, appointments, settings);
    if (conflicts.length > 0) {
      setPendingConflict({ appointment, conflicts });
      return;
    }

    await saveAppointment(appointment);
    setAppointmentDrafts((current) => {
      const draftKey = getDraftKey(appointment.date, appointment.staffId, appointment.startTime);
      if (!(draftKey in current)) return current;
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
    setEditingAppointment(undefined);
  };

  if (!ready) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">美</div>
        <p>正在打开本机预约数据...</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="icon-button ghost" type="button" aria-label="上一天" onClick={() => setSelectedDate(addDays(selectedDate, -1))}>
          <ChevronLeft size={21} />
        </button>
        <div>
          <h1>美约管家</h1>
          <p>{formatDateTitle(selectedDate, currentToday)}</p>
        </div>
        <button className="primary-action" type="button" onClick={() => openNewAppointment()}>
          <Plus size={18} />
          新增预约
        </button>
      </header>

      {error ? <div className="alert-banner">{error}</div> : null}

      <section className="date-toolbar" aria-label="日期选择">
        <button className="icon-button" type="button" aria-label="前一天" onClick={() => setSelectedDate(addDays(selectedDate, -1))}>
          <ChevronLeft size={19} />
        </button>
        <DatePickerControl selectedDate={selectedDate} setSelectedDate={setSelectedDate} todayDate={currentToday} />
        <button className="today-button" type="button" aria-label="回到今天" onClick={() => setSelectedDate(currentToday)}>
          {dateStatusLabel}
        </button>
        <button className="icon-button" type="button" aria-label="后一天" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
          <ChevronRight size={19} />
        </button>
      </section>

      <section className={`summary-row ${hideScheduleIncome ? "single-summary" : ""}`} aria-label="今日统计">
        <StatCard tone="rose" icon={<CalendarDays size={22} />} label="今日预约" value={`${dateAppointments.length} 单`} />
        {!hideScheduleIncome ? (
          <StatCard tone="teal" icon={<WalletCards size={23} />} label="今日收入" value={formatCurrency(income, settings.currencyCode)} />
        ) : null}
      </section>

      <div className="content-area">
        {activeTab === "schedule" ? (
          <ScheduleView
            appointments={dateAppointments}
            currentDateTime={currentDateTime}
            onEditAppointment={setEditingAppointment}
            onOpenStaff={(staffId) => setViewingStaffId(staffId)}
            onNewAppointment={openNewAppointment}
            selectedDate={selectedDate}
            settings={settings}
            staff={activeStaff}
          />
        ) : null}
        {activeTab === "staff" ? (
          <StaffView addStaff={addStaff} onOpenStaff={(staffId) => setViewingStaffId(staffId)} staff={staff} />
        ) : null}
        {activeTab === "ledger" ? (
          <LedgerView appointments={dateAppointments} settings={settings} staff={staff} selectedDate={selectedDate} />
        ) : null}
        {activeTab === "settings" ? (
          <SettingsView
            addService={addService}
            deleteService={deleteService}
            saveSettings={saveSettings}
            services={services}
            settings={settings}
            updateService={updateService}
          />
        ) : null}
      </div>

      <nav className="bottom-nav" aria-label="底部导航">
        {tabItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={activeTab === item.id ? "active" : ""}
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {editingAppointment ? (
        <AppointmentSheet
          activeStaff={activeStaff}
          allStaff={staff}
          appointment={editingAppointment}
          customerMemory={customerMemory}
          onClose={(nextForm, dirty) => {
            const isExisting = appointments.some((item) => item.id === nextForm.id);
            if (!isExisting) {
              const draftKey = getDraftKey(nextForm.date, nextForm.staffId, nextForm.startTime);
              const hasCustomerName = nextForm.customerName.trim().length > 0;
              setAppointmentDrafts((current) => {
                const next = { ...current };
                if (dirty || hasCustomerName) {
                  next[draftKey] = nextForm;
                } else {
                  delete next[draftKey];
                }
                return next;
              });
            }
            setEditingAppointment(undefined);
          }}
          onDelete={async (appointmentId) => {
            await deleteAppointment(appointmentId);
            setEditingAppointment(undefined);
          }}
          onSave={handleSaveAppointment}
          services={services}
          settings={settings}
          todayDate={currentToday}
        />
      ) : null}
      {viewingStaff ? (
        <StaffDetailSheet
          appointments={appointments}
          onClose={() => setViewingStaffId(undefined)}
          onDelete={async (staffId) => {
            const result = await deleteStaff(staffId);
            setViewingStaffId(undefined);
            if (result === "deactivated") {
              window.alert("该员工已有历史预约，已改为停用并保留账本记录。");
            }
          }}
          person={viewingStaff}
          updateStaff={updateStaff}
        />
      ) : null}
      {pendingConflict ? (
        <ConflictDialog
          conflicts={pendingConflict.conflicts}
          onCancel={() => setPendingConflict(undefined)}
          onContinue={async () => {
            await saveAppointment(pendingConflict.appointment);
            setPendingConflict(undefined);
            setEditingAppointment(undefined);
          }}
          settings={settings}
          staff={staff}
        />
      ) : null}
      {showExitDialog ? (
        <ConfirmDialog
          confirmLabel="退出 App"
          description="确认后会关闭当前应用，已保存的预约和设置会继续保留在本机。"
          onCancel={() => setShowExitDialog(false)}
          onConfirm={async () => {
            setShowExitDialog(false);
            if (Capacitor.isNativePlatform()) {
              await CapacitorApp.exitApp();
            }
          }}
          title="是否退出 App？"
        />
      ) : null}
    </main>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  tone: "rose" | "teal";
  value: string;
}

const StatCard = ({ icon, label, tone, value }: StatCardProps) => (
  <article className={`stat-card ${tone}`}>
    <div className="stat-icon">{icon}</div>
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  </article>
);

interface DatePickerControlProps {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  todayDate: string;
}

const DatePickerControl = ({ selectedDate, setSelectedDate, todayDate }: DatePickerControlProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="date-input" type="button" onClick={() => setOpen(true)}>
        <CalendarDays className="date-input-leading" size={17} />
      <span>{selectedDate.replace(/-/g, "/")}</span>
      <CalendarDays className="date-input-trailing" size={17} />
      </button>
      {open ? (
        <CalendarDialog
          selectedDate={selectedDate}
          todayDate={todayDate}
          onClose={() => setOpen(false)}
          onSelect={(date) => {
            setSelectedDate(date);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
};

interface CalendarDialogProps {
  onClose: () => void;
  onSelect: (date: string) => void;
  selectedDate: string;
  todayDate: string;
}

const CalendarDialog = ({ onClose, onSelect, selectedDate, todayDate }: CalendarDialogProps) => {
  const [viewMonth, setViewMonth] = useState(selectedDate);
  const days = useMemo(() => getCalendarDays(viewMonth), [viewMonth]);
  const selectedMonth = parseISODate(viewMonth).getMonth();

  useAppBackHandler(true, onClose);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="calendar-dialog" role="dialog" aria-modal="true" aria-label="选择日期" onMouseDown={(event) => event.stopPropagation()}>
        <header className="calendar-header">
          <button className="icon-button" type="button" aria-label="上个月" onClick={() => setViewMonth(addMonths(viewMonth, -1))}>
            <ChevronLeft size={18} />
          </button>
          <strong>{formatCalendarMonth(viewMonth)}</strong>
          <button className="icon-button" type="button" aria-label="下个月" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
            <ChevronRight size={18} />
          </button>
        </header>
        <div className="calendar-weekdays" aria-hidden="true">
          {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((day) => {
            const value = dateToISO(day);
            const inMonth = day.getMonth() === selectedMonth;
            return (
              <button
                className={`${value === selectedDate ? "selected" : ""} ${value === todayDate ? "today" : ""}`}
                key={value}
                type="button"
                onClick={() => onSelect(value)}
              >
                <span className={inMonth ? "" : "muted-day"}>{day.getDate()}</span>
              </button>
            );
          })}
        </div>
        <footer className="calendar-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="save-button" type="button" onClick={() => onSelect(todayDate)}>
            今天
          </button>
        </footer>
      </section>
    </div>
  );
};

interface DateFieldButtonProps {
  label: string;
  onChange: (date: string) => void;
  todayDate: string;
  value: string;
}

const DateFieldButton = ({ label, onChange, todayDate, value }: DateFieldButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <label>
      {label}
      <button className="form-date-button" type="button" onClick={() => setOpen(true)}>
        <span>{value.replace(/-/g, "/")}</span>
        <CalendarDays size={17} />
      </button>
      {open ? (
        <CalendarDialog
          selectedDate={value}
          todayDate={todayDate}
          onClose={() => setOpen(false)}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      ) : null}
    </label>
  );
};

interface ScheduleViewProps {
  appointments: Appointment[];
  currentDateTime: Date;
  onEditAppointment: (appointment: Appointment) => void;
  onOpenStaff: (staffId: string) => void;
  onNewAppointment: (staffId: string, startTime: string) => void;
  selectedDate: string;
  settings: Settings;
  staff: Staff[];
}

const ScheduleView = ({
  appointments,
  currentDateTime,
  onEditAppointment,
  onOpenStaff,
  onNewAppointment,
  selectedDate,
  settings,
  staff,
}: ScheduleViewProps) => {
  const [scale, setScale] = useState(1);
  const pinchRef = useRef<{ distance: number; scale: number } | undefined>();
  const slots = useMemo(
    () => createTimeSlots(settings.businessStart, settings.businessEnd, settings.slotMinutes),
    [settings],
  );
  const isTodaySchedule = selectedDate === todayISO(currentDateTime);
  const nowMinutes = currentDateTime.getHours() * 60 + currentDateTime.getMinutes();
  const currentRowIndex = useMemo(() => {
    if (!isTodaySchedule) {
      return -1;
    }

    const startMinutes = timeToMinutes(settings.businessStart);
    const endMinutes = timeToMinutes(settings.businessEnd);

    if (nowMinutes < startMinutes || nowMinutes >= endMinutes) {
      return -1;
    }

    return Math.floor((nowMinutes - startMinutes) / settings.slotMinutes);
  }, [isTodaySchedule, nowMinutes, settings]);
  const baseSlotHeight = Math.max(32, Math.round((settings.slotMinutes / 30) * 56));
  const slotHeight = Math.round(baseSlotHeight * scale);
  const timeColumnWidth = Math.round(Math.max(46, 58 * scale));
  const staffColumnWidth = Math.round(Math.max(96, 148 * scale));
  const fontScale = Math.min(1.1, Math.max(0.9, 1 + (scale - 1) * 0.28));
  const compactSchedule = scale <= 0.84;
  const showFineTimeLabels = scale >= 1.05;
  const distanceBetweenTouches = (touches: React.TouchList): number => {
    const first = touches[0];
    const second = touches[1];
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  };

  const updateScale = (nextScale: number) => {
    setScale(Math.min(1.35, Math.max(0.68, nextScale)));
  };

  if (staff.length === 0) {
    return (
      <section className="empty-state">
        <UsersRound size={34} />
        <h2>还没有可排班员工</h2>
        <p>先到员工页添加或启用员工。</p>
      </section>
    );
  }

  return (
    <section
      className={`schedule-section ${compactSchedule ? "compact-schedule" : ""}`}
      data-show-fine-time={showFineTimeLabels ? "true" : "false"}
      aria-label="日程表"
      style={{ "--schedule-font-scale": fontScale } as React.CSSProperties}
    >
      <div className="schedule-tools" aria-label="排班缩放">
        <span>双指缩放排班</span>
        <div>
          <button type="button" aria-label="缩小排班" onClick={() => updateScale(scale - 0.1)}>
            <ZoomOut size={16} />
          </button>
          <button type="button" onClick={() => updateScale(1)}>
            {Math.round(scale * 100)}%
          </button>
          <button type="button" aria-label="放大排班" onClick={() => updateScale(scale + 0.1)}>
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
      <div
        className="schedule-scroller"
        onTouchStart={(event) => {
          if (event.touches.length === 2) {
            pinchRef.current = { distance: distanceBetweenTouches(event.touches), scale };
          }
        }}
        onTouchMove={(event) => {
          if (event.touches.length === 2 && pinchRef.current) {
            event.preventDefault();
            updateScale(pinchRef.current.scale * (distanceBetweenTouches(event.touches) / pinchRef.current.distance));
          }
        }}
        onTouchEnd={() => {
          pinchRef.current = undefined;
        }}
        onWheel={(event) => {
          if (!event.ctrlKey) {
            return;
          }
          event.preventDefault();
          updateScale(scale + (event.deltaY > 0 ? -0.08 : 0.08));
        }}
      >
        <div
          className="staff-strip"
          aria-label="员工列表"
          style={
            {
              "--staff-count": staff.length,
              "--staff-column-width": `${staffColumnWidth}px`,
              "--time-column-width": `${timeColumnWidth}px`,
            } as React.CSSProperties
          }
        >
          <div className="staff-strip-spacer" aria-hidden="true" />
          {staff.map((person) => (
            <button
              aria-label={`查看${person.name}排班`}
              className="staff-chip"
              key={person.id}
              style={{ "--staff-color": person.color } as React.CSSProperties}
              type="button"
              onClick={() => onOpenStaff(person.id)}
            >
              <span className="avatar">{staffInitial(person.name)}</span>
              <strong>{person.name}</strong>
            </button>
          ))}
        </div>
        <div
          className="schedule-grid"
          style={
            {
              "--staff-count": staff.length,
              "--staff-column-width": `${staffColumnWidth}px`,
              "--slot-count": slots.length,
              "--slot-height": `${slotHeight}px`,
              "--time-column-width": `${timeColumnWidth}px`,
            } as React.CSSProperties
          }
        >
          <div className="corner-cell" />
          {staff.map((person, staffIndex) => (
            <div
              className="grid-staff-header"
              key={person.id}
              style={{ gridColumn: staffIndex + 2, "--staff-color": person.color } as React.CSSProperties}
            >
              <span className="avatar">{staffInitial(person.name)}</span>
              <span>{person.name}</span>
            </div>
          ))}
          {slots.map((slot, slotIndex) => {
            const minute = timeToMinutes(slot) % 60;
            const isMajorTime = minute === 0 || minute === 30;
            const isPastSlot = isTodaySchedule && timeToMinutes(slot) < nowMinutes;
            return (
              <div
                className={`time-label ${isMajorTime ? "major-time-label" : "fine-time-label"} ${isPastSlot ? "past-time-label" : ""}`}
                key={slot}
                style={{ gridRow: slotIndex + 2 }}
              >
                <span>{slot}</span>
              </div>
            );
          })}
          {staff.flatMap((person, staffIndex) =>
            slots.map((slot, slotIndex) => {
              const isPastSlot = isTodaySchedule && timeToMinutes(slot) < nowMinutes;
              return (
                <button
                  aria-label={`${person.name} ${slot} 新增预约`}
                  className={`time-cell ${isPastSlot ? "past-time-cell" : ""}`}
                  key={`${person.id}-${slot}`}
                  style={{ gridColumn: staffIndex + 2, gridRow: slotIndex + 2 }}
                  type="button"
                  onClick={() => onNewAppointment(person.id, slot)}
                />
              );
            }),
          )}
          {currentRowIndex >= 0 && currentRowIndex < slots.length ? (
            <div
              aria-hidden="true"
              className="current-time-row"
              style={{ gridColumn: "1 / -1", gridRow: currentRowIndex + 2 }}
            />
          ) : null}
          {appointments.map((appointment) => {
            const person = getStaffById(staff, appointment.staffId);
            if (!person) {
              return null;
            }
            const staffIndex = staff.findIndex((candidate) => candidate.id === appointment.staffId);
            const slotIndex = slots.indexOf(appointment.startTime);
            if (staffIndex < 0 || slotIndex < 0) {
              return null;
            }
            const durationRows = Math.max(1, Math.ceil(getAppointmentDurationMinutes(appointment) / settings.slotMinutes));
            return (
              <button
                className="appointment-block"
                key={appointment.id}
                style={
                  {
                    gridColumn: staffIndex + 2,
                    gridRow: `${slotIndex + 2} / span ${durationRows}`,
                    "--staff-color": person.color,
                    "--staff-bg": colorWithAlpha(person.color, 0.16),
                  } as React.CSSProperties
                }
                type="button"
                onClick={() => onEditAppointment(appointment)}
              >
                <strong className="appointment-customer">{appointment.customerName || "未命名客户"}</strong>
                <span className="appointment-service">{appointment.service || "未填写服务"}</span>
                {settings.incomeDisplayMode === "hideAllReadOnly" ? null : (
                  <small>{formatCurrency(appointment.price, settings.currencyCode)}</small>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

interface AppointmentSheetProps {
  activeStaff: Staff[];
  allStaff: Staff[];
  appointment: Appointment;
  customerMemory: CustomerMemoryRecord[];
  onClose: (nextForm: Appointment, dirty: boolean) => void;
  onDelete: (appointmentId: string) => Promise<void>;
  onSave: (appointment: Appointment) => Promise<void>;
  services: ServiceItem[];
  settings: Settings;
  todayDate: string;
}

const AppointmentSheet = ({
  activeStaff,
  allStaff,
  appointment,
  customerMemory,
  onClose,
  onDelete,
  onSave,
  services,
  settings,
  todayDate,
}: AppointmentSheetProps) => {
  const [form, setForm] = useState(appointment);
  const [saving, setSaving] = useState(false);
  const [initialForm, setInitialForm] = useState(appointment);
  const currencyLabel = currencyOptions.find((option) => option.code === settings.currencyCode)?.label ?? settings.currencyCode;
  const slots = useMemo(
    () => createTimeSlots(settings.businessStart, settings.businessEnd, settings.slotMinutes),
    [settings],
  );
  const staffOptions = useMemo(() => {
    const currentStaff = getStaffById(allStaff, form.staffId);
    const active = activeStaff;
    return currentStaff && !active.some((person) => person.id === currentStaff.id) ? [...active, currentStaff] : active;
  }, [activeStaff, allStaff, form.staffId]);
  const staffSelectOptions = useMemo(
    () => staffOptions.map((person) => ({ label: person.name, value: person.id })),
    [staffOptions],
  );
  const slotSelectOptions = useMemo(() => slots.map((slot) => ({ label: slot, value: slot })), [slots]);
  const durationSelectOptions = useMemo(
    () => durationOptions.map((option) => ({ label: option.label, value: option.minutes })),
    [],
  );

  useEffect(() => {
    setForm(appointment);
    setInitialForm(appointment);
  }, [appointment]);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  useAppBackHandler(true, () => onClose(form, isDirty));

  const updateForm = <Key extends keyof Appointment>(key: Key, value: Appointment[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applyService = (serviceName: string) => {
    const matchedService = services.find((service) => service.name === serviceName);
    setForm((current) => ({
      ...current,
      service: serviceName,
      price: matchedService ? matchedService.price : current.price,
      durationMinutes: matchedService ? matchedService.durationMinutes : current.durationMinutes,
    }));
  };

  const applyCustomerMemory = (record: CustomerMemoryRecord) => {
    setForm((current) => ({
      ...current,
      customerName: record.name || current.customerName,
      phone: record.phone || current.phone,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.customerName.trim()) {
      window.alert("请填写客户姓名。");
      return;
    }
    if (!form.service.trim()) {
      window.alert("请填写服务内容。");
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...form, customerName: form.customerName.trim(), service: form.service.trim(), phone: form.phone.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onClick={() => onClose(form, isDirty)}>
      <form className="appointment-sheet" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <h2>预约详情</h2>
            <p>
              {form.startTime} - {appointmentEndTime(form, settings)}
            </p>
          </div>
          <button className="delete-button" type="button" onClick={() => onDelete(form.id)}>
            <Trash2 size={17} />
            删除
          </button>
        </header>

        <div className="form-grid">
          <CustomerMemoryInput
            enabled={settings.customerMemoryEnabled}
            field="name"
            label="客户姓名"
            memory={customerMemory}
            onSelect={applyCustomerMemory}
            onValueChange={(value) => updateForm("customerName", value)}
            placeholder="王女士"
            value={form.customerName}
          />
          <CustomerMemoryInput
            enabled={settings.customerMemoryEnabled}
            field="phone"
            inputMode="tel"
            label="电话"
            memory={customerMemory}
            onSelect={applyCustomerMemory}
            onValueChange={(value) => updateForm("phone", value)}
            placeholder="138 8888 8888"
            value={form.phone}
          />
          <label>
            <ServicePickerField
              currencyCode={settings.currencyCode}
              hidePrice={settings.incomeDisplayMode === "hideAllReadOnly"}
              onChange={applyService}
              services={services}
              value={form.service}
            />
          </label>
          <label>
            价格（{currencyLabel}）
            <input
              value={form.price || ""}
              inputMode="decimal"
              onChange={(event) => updateForm("price", Number(event.target.value.replace(/[^\d.]/g, "")))}
              placeholder="198"
            />
          </label>
          <SelectSheetField label="员工" title="选择员工" value={form.staffId} options={staffSelectOptions} onChange={(value) => updateForm("staffId", value)} />
          <DateFieldButton label="日期" todayDate={todayDate} value={form.date} onChange={(date) => updateForm("date", date)} />
          <SelectSheetField label="开始时间" title="选择开始时间" value={form.startTime} options={slotSelectOptions} onChange={(value) => updateForm("startTime", value)} />
          <SelectSheetField
            label="时长"
            title="选择预约时长"
            value={form.durationMinutes}
            options={durationSelectOptions}
            onChange={(value) => updateForm("durationMinutes", value)}
          />
          <label className="wide-field">
            备注（可选）
            <textarea value={form.note ?? ""} onChange={(event) => updateForm("note", event.target.value)} placeholder="请输入备注" />
          </label>
        </div>

        <footer className="sheet-actions">
          <button className="secondary-button" type="button" onClick={() => onClose(form, isDirty)}>
            取消
          </button>
          <button className="save-button" disabled={saving} type="submit">
            {saving ? "保存中..." : "保存"}
          </button>
        </footer>
      </form>
    </div>
  );
};

interface CustomerMemoryInputProps {
  enabled: boolean;
  field: "name" | "phone";
  inputMode?: "tel";
  label: string;
  memory: CustomerMemoryRecord[];
  onSelect: (record: CustomerMemoryRecord) => void;
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
}

const CustomerMemoryInput = ({
  enabled,
  field,
  inputMode,
  label,
  memory,
  onSelect,
  onValueChange,
  placeholder,
  value,
}: CustomerMemoryInputProps) => {
  const [open, setOpen] = useState(false);
  const query = normalizeMemoryText(value);
  const queryDigits = normalizePhoneDigits(value);
  const suggestions = useMemo(() => {
    if (!enabled || (!query && !queryDigits)) {
      return [];
    }

    return memory
      .filter((record) => {
        const name = normalizeMemoryText(record.name);
        const phoneDigits = normalizePhoneDigits(record.phone);
        if (field === "name") {
          return name.includes(query) || (!!queryDigits && phoneDigits.includes(queryDigits));
        }
        return (!!queryDigits && phoneDigits.includes(queryDigits)) || (!!query && name.includes(query));
      })
      .slice(0, 6);
  }, [enabled, field, memory, query, queryDigits]);
  const showSuggestions = open && suggestions.length > 0;

  const selectRecord = (record: CustomerMemoryRecord) => {
    onSelect(record);
    setOpen(false);
  };

  return (
    <label className="customer-memory-field">
      {label}
      <div className="customer-memory-input">
        <input
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-label={label}
          inputMode={inputMode}
          value={value}
          onBlur={() => window.setTimeout(() => setOpen(false), 100)}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && suggestions[0]) {
              event.preventDefault();
              selectRecord(suggestions[0]);
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
        />
        {showSuggestions ? (
          <div className="customer-memory-menu" role="listbox" aria-label={`${label}历史客户`}>
            {suggestions.map((record) => (
              <button
                aria-selected="false"
                key={record.key}
                role="option"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => selectRecord(record)}
              >
                <span>
                  <strong>{record.name || "未命名客户"}</strong>
                  <small>{record.phone || "未记录电话"}</small>
                </span>
                <em>{record.lastSeen}</em>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
};

interface ServicePickerFieldProps {
  currencyCode: CurrencyCode;
  hidePrice?: boolean;
  onChange: (serviceName: string) => void;
  services: ServiceItem[];
  value: string;
}

const ServicePickerField = ({ currencyCode, hidePrice = false, onChange, services, value }: ServicePickerFieldProps) => {
  const [open, setOpen] = useState(false);
  const search = value.trim().toLowerCase();
  const visibleServices = useMemo(
    () => services.filter((service) => !search || service.name.toLowerCase().includes(search)).slice(0, 8),
    [search, services],
  );

  const selectService = (service: ServiceItem) => {
    onChange(service.name);
    setOpen(false);
  };

  return (
    <>
      服务内容
      <div className="service-picker">
        <input
          aria-label="服务内容"
          value={value}
          onBlur={() => window.setTimeout(() => setOpen(false), 100)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="美甲(延长)"
        />
        <button className="service-picker-toggle" type="button" aria-label="展开服务项目" onClick={() => setOpen((current) => !current)}>
          <ChevronDown size={17} />
        </button>
        {open ? (
          <div className="service-picker-menu" role="listbox" aria-label="服务项目">
            {visibleServices.length > 0 ? (
              visibleServices.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  role="option"
                  aria-selected={service.name === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => selectService(service)}
                >
                  <span>
                    <strong>{service.name}</strong>
                    <small>{durationLabel(service.durationMinutes)}</small>
                  </span>
                  {!hidePrice ? <b>{formatCurrency(service.price, currencyCode)}</b> : null}
                </button>
              ))
            ) : (
              <p>没有匹配的服务，可直接输入自定义内容。</p>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
};

interface ConflictDialogProps {
  conflicts: Appointment[];
  onCancel: () => void;
  onContinue: () => Promise<void>;
  settings: Settings;
  staff: Staff[];
}

const ConflictDialog = ({ conflicts, onCancel, onContinue, settings, staff }: ConflictDialogProps) => {
  const [saving, setSaving] = useState(false);
  useAppBackHandler(true, onCancel);
  
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <header>
          <h2 id="conflict-title">该员工此时间已有预约</h2>
          <p>仍然保存吗？</p>
        </header>
        <div className="conflict-list">
          {conflicts.map((appointment) => {
            const person = getStaffById(staff, appointment.staffId);
            return (
              <article key={appointment.id}>
                <strong>{appointment.customerName || "未命名客户"}</strong>
                <span>
                  {appointment.startTime}-{appointmentEndTime(appointment, settings)} · {person?.name ?? "未知员工"}
                </span>
              </article>
            );
          })}
        </div>
        <footer>
          <button className="secondary-button" type="button" onClick={onCancel}>
            返回修改
          </button>
          <button
            className="save-button"
            disabled={saving}
            type="button"
            onClick={async () => {
              setSaving(true);
              try {
                await onContinue();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中..." : "仍然保存"}
          </button>
        </footer>
      </section>
    </div>
  );
};

interface ConfirmDialogProps {
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
}

const ConfirmDialog = ({ confirmLabel, description, onCancel, onConfirm, title }: ConfirmDialogProps) => {
  const [saving, setSaving] = useState(false);
  useAppBackHandler(true, onCancel);
  
  return (
    <div className="dialog-backdrop top-dialog" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <header>
          <h2 id="confirm-title">{title}</h2>
          <p>{description}</p>
        </header>
        <footer>
          <button className="secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="save-button danger"
            disabled={saving}
            type="button"
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "处理中..." : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
};

interface StaffViewProps {
  addStaff: (name: string) => Promise<void>;
  onOpenStaff: (staffId: string) => void;
  staff: Staff[];
}

const StaffView = ({ addStaff, onOpenStaff, staff }: StaffViewProps) => {
  const [newStaffName, setNewStaffName] = useState("");

  const handleAddStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newStaffName.trim();
    if (!name) {
      return;
    }
    await addStaff(name);
    setNewStaffName("");
  };

  return (
    <section className="panel-section">
      <header className="section-title">
        <h2>员工管理</h2>
        <span>{staff.filter((person) => person.active).length} 人可排班</span>
      </header>
      <form className="inline-add-form" onSubmit={handleAddStaff}>
        <input value={newStaffName} onChange={(event) => setNewStaffName(event.target.value)} placeholder="输入员工姓名" />
        <button type="submit">
          <Plus size={18} />
          添加
        </button>
      </form>
      <div className="staff-list">
        {staff.map((person) => (
          <button
            className="staff-row-card"
            key={person.id}
            style={{ "--staff-color": person.color } as React.CSSProperties}
            type="button"
            onClick={() => onOpenStaff(person.id)}
          >
            <span className="avatar">{staffInitial(person.name)}</span>
            <div>
              <strong>{person.name}</strong>
              <small>{person.active ? "可排班" : "已停用"}</small>
            </div>
            <span className={`status-pill ${person.active ? "active" : ""}`}>{person.active ? "启用" : "停用"}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

interface StaffDetailSheetProps {
  appointments: Appointment[];
  onClose: () => void;
  onDelete: (staffId: string) => Promise<void>;
  person: Staff;
  updateStaff: (id: string, patch: Partial<Omit<Staff, "id">>) => Promise<void>;
}

const StaffDetailSheet = ({ appointments, onClose, onDelete, person, updateStaff }: StaffDetailSheetProps) => {
  const [draftName, setDraftName] = useState(person.name);
  const [active, setActive] = useState(person.active);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const appointmentCount = appointments.filter((appointment) => appointment.staffId === person.id).length;

  useAppBackHandler(true, onClose);

  useEffect(() => {
    setDraftName(person.name);
    setActive(person.active);
  }, [person]);

  const saveStaff = async () => {
    const name = draftName.trim();
    if (!name) {
      window.alert("员工姓名不能为空。");
      return;
    }

    setSaving(true);
    try {
      await updateStaff(person.id, { active, name });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="sheet-backdrop" role="presentation">
        <section className="staff-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="staff-detail-title">
          <div className="sheet-handle" />
          <header className="sheet-header">
            <div>
              <h2 id="staff-detail-title">员工信息</h2>
              <p>{appointmentCount} 单历史预约</p>
            </div>
            <button className="delete-button" type="button" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={17} />
              删除
            </button>
          </header>

          <div className="staff-profile-card" style={{ "--staff-color": person.color } as React.CSSProperties}>
            <span className="avatar">{staffInitial(person.name)}</span>
            <div>
              <strong>{person.name}</strong>
              <small>{person.active ? "当前可排班" : "当前已停用"}</small>
            </div>
          </div>

          <div className="settings-form">
            <label>
              员工姓名
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="输入员工姓名" />
            </label>
            <label className="switch-row">
              <span>允许排班</span>
              <input checked={active} type="checkbox" onChange={(event) => setActive(event.target.checked)} />
            </label>
          </div>

          <footer className="sheet-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="save-button" disabled={saving} type="button" onClick={saveStaff}>
              {saving ? "保存中..." : "保存员工"}
            </button>
          </footer>
        </section>
      </div>
      {confirmingDelete ? (
        <ConfirmDialog
          title="确认删除员工？"
          description={
            appointmentCount > 0
              ? `该员工已有 ${appointmentCount} 单历史预约，确认后会停用员工并从排班隐藏，账本记录保留。`
              : "该员工没有历史预约，确认后会从员工列表删除。"
          }
          confirmLabel="确认删除"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            await onDelete(person.id);
            setConfirmingDelete(false);
          }}
        />
      ) : null}
    </>
  );
};

interface LedgerViewProps {
  appointments: Appointment[];
  selectedDate: string;
  settings: Settings;
  staff: Staff[];
}

const LedgerView = ({ appointments, selectedDate, settings, staff }: LedgerViewProps) => {
  const staffTotals = useMemo(() => getStaffTotals(staff, appointments), [appointments, staff]);
  const income = appointments.reduce((sum, appointment) => sum + appointment.price, 0);
  const hideReadOnlyIncome = settings.incomeDisplayMode === "hideAllReadOnly";

  return (
    <section className="panel-section">
      <header className="section-title">
        <h2>账本汇总</h2>
        <span>{selectedDate}</span>
      </header>
      <div className={`ledger-summary ${hideReadOnlyIncome ? "single-summary" : ""}`}>
        <StatCard tone="rose" icon={<CalendarDays size={22} />} label="预约数量" value={`${appointments.length} 单`} />
        {!hideReadOnlyIncome ? (
          <StatCard tone="teal" icon={<WalletCards size={23} />} label="收入合计" value={formatCurrency(income, settings.currencyCode)} />
        ) : null}
      </div>
      <div className="staff-total-list">
        {staffTotals.map(({ staff: person, count, income: staffIncome }) => (
          <article
            className={`staff-total-row ${hideReadOnlyIncome ? "income-hidden" : ""}`}
            key={person.id}
            style={{ "--staff-color": person.color } as React.CSSProperties}
          >
            <span className="avatar">{staffInitial(person.name)}</span>
            <div>
              <strong>{person.name}</strong>
              <small>{count} 单</small>
            </div>
            {!hideReadOnlyIncome ? <b>{formatCurrency(staffIncome, settings.currencyCode)}</b> : null}
          </article>
        ))}
      </div>
      <div className="appointment-list">
        {appointments.map((appointment) => {
          const person = getStaffById(staff, appointment.staffId);
          return (
            <article className={`ledger-appointment ${hideReadOnlyIncome ? "income-hidden" : ""}`} key={appointment.id}>
              <div>
                <strong>{appointment.customerName}</strong>
                <span>
                  {appointment.startTime}-{appointmentEndTime(appointment, settings)} · {person?.name ?? "未知员工"}
                </span>
              </div>
              {!hideReadOnlyIncome ? <b>{formatCurrency(appointment.price, settings.currencyCode)}</b> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
};

interface SettingsViewProps {
  addService: (service: Omit<ServiceItem, "id">) => Promise<void>;
  deleteService: (serviceId: string) => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  services: ServiceItem[];
  settings: Settings;
  updateService: (id: string, patch: Partial<Omit<ServiceItem, "id">>) => Promise<void>;
}

const SettingsView = ({ addService, deleteService, saveSettings, services, settings, updateService }: SettingsViewProps) => {
  const [draft, setDraft] = useState(settings);
  const [newService, setNewService] = useState({ durationMinutes: 60, name: "", price: 0 });
  const [servicesOpen, setServicesOpen] = useState(false);
  const clockOptions = useMemo(() => createClockOptions(), []);
  const clockSelectOptions = useMemo(() => clockOptions.map((option) => ({ label: option, value: option })), [clockOptions]);
  const slotSelectOptions = useMemo(
    () => slotIntervalOptions.map((option) => ({ label: option.label, value: option.minutes })),
    [],
  );
  const currencySelectOptions = useMemo(
    () => currencyOptions.map((option) => ({ label: option.label, value: option.code })),
    [],
  );
  const incomeDisplaySelectOptions = useMemo(
    () => incomeDisplayOptions.map((option) => ({ label: option.label, value: option.mode })),
    [],
  );
  const customerMemorySelectOptions = useMemo(
    () => [
      { description: "姓名和电话从已保存预约自动补全", label: "开启", value: "enabled" },
      { description: "预约表单只保留手动输入", label: "关闭", value: "disabled" },
    ],
    [],
  );
  const durationSelectOptions = useMemo(
    () => durationOptions.map((option) => ({ label: option.label, value: option.minutes })),
    [],
  );

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.businessStart >= draft.businessEnd) {
      window.alert("结束时间需要晚于开始时间。");
      return;
    }
    await saveSettings(draft);
  };

  const handleAddService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newService.name.trim();
    if (!name) {
      window.alert("请填写服务名称。");
      return;
    }
    await addService({ ...newService, name });
    setNewService({ durationMinutes: 60, name: "", price: 0 });
  };

  return (
    <section className="panel-section">
      <header className="section-title">
        <h2>营业设置</h2>
        <span>{draft.slotMinutes}分钟一格</span>
      </header>
      <form className="settings-form" onSubmit={handleSubmit}>
        <SelectSheetField
          label="营业开始"
          title="选择营业开始时间"
          value={draft.businessStart}
          options={clockSelectOptions}
          onChange={(value) => setDraft((current) => ({ ...current, businessStart: value }))}
        />
        <SelectSheetField
          label="营业结束"
          title="选择营业结束时间"
          value={draft.businessEnd}
          options={clockSelectOptions}
          onChange={(value) => setDraft((current) => ({ ...current, businessEnd: value }))}
        />
        <SelectSheetField
          label="时间间隔"
          title="选择时间间隔"
          value={draft.slotMinutes}
          options={slotSelectOptions}
          onChange={(value) => setDraft((current) => ({ ...current, slotMinutes: value }))}
        />
        <SelectSheetField
          label="收入货币"
          title="选择收入货币"
          value={draft.currencyCode}
          options={currencySelectOptions}
          onChange={(value) => setDraft((current) => ({ ...current, currencyCode: value }))}
        />
        <SelectSheetField
          label="收入显示"
          title="选择收入显示"
          value={draft.incomeDisplayMode}
          options={incomeDisplaySelectOptions}
          onChange={(value) => setDraft((current) => ({ ...current, incomeDisplayMode: value }))}
        />
        <SelectSheetField
          label="客户记忆"
          title="选择客户记忆"
          value={draft.customerMemoryEnabled ? "enabled" : "disabled"}
          options={customerMemorySelectOptions}
          onChange={(value) => setDraft((current) => ({ ...current, customerMemoryEnabled: value === "enabled" }))}
        />
        <button className="save-button" type="submit">
          保存设置
        </button>
      </form>
      <section className="service-settings" aria-label="服务项目设置">
        <button className="service-settings-toggle" type="button" onClick={() => setServicesOpen((current) => !current)}>
          <span>
            <strong>服务项目</strong>
            <small>
              {services.length} 项 · {currencyOptions.find((option) => option.code === draft.currencyCode)?.label ?? draft.currencyCode}
            </small>
          </span>
          <ChevronDown className={servicesOpen ? "expanded" : ""} size={18} />
        </button>
        {servicesOpen ? (
          <div className="service-settings-body">
            <form className="service-add-form" onSubmit={handleAddService}>
              <input value={newService.name} onChange={(event) => setNewService((current) => ({ ...current, name: event.target.value }))} placeholder="服务名称" />
              <input
                value={newService.price || ""}
                inputMode="decimal"
                onChange={(event) => setNewService((current) => ({ ...current, price: Number(event.target.value.replace(/[^\d.]/g, "")) }))}
                placeholder="价格"
              />
              <SelectSheetField
                compact
                label="服务时长"
                title="选择服务时长"
                value={newService.durationMinutes}
                options={durationSelectOptions}
                onChange={(value) => setNewService((current) => ({ ...current, durationMinutes: value }))}
              />
              <button type="submit">
                <Plus size={17} />
                添加
              </button>
            </form>
            <div className="service-list">
              {services.map((service) => (
                <ServiceRow deleteService={deleteService} key={service.id} service={service} updateService={updateService} />
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <div className="native-note">
        <Clock3 size={18} />
        <span>浏览器数据保存在本机；打包原生应用时仍使用同一份界面。</span>
      </div>
    </section>
  );
};

interface ServiceRowProps {
  deleteService: (serviceId: string) => Promise<void>;
  service: ServiceItem;
  updateService: (id: string, patch: Partial<Omit<ServiceItem, "id">>) => Promise<void>;
}

const ServiceRow = ({ deleteService, service, updateService }: ServiceRowProps) => {
  const [draft, setDraft] = useState(service);
  const [saving, setSaving] = useState(false);
  const durationSelectOptions = useMemo(
    () => durationOptions.map((option) => ({ label: option.label, value: option.minutes })),
    [],
  );
  
  useEffect(() => {
    setDraft(service);
  }, [service]);

  const saveService = async () => {
    const name = draft.name.trim();
    if (!name) {
      window.alert("服务名称不能为空。");
      return;
    }
    setSaving(true);
    try {
      await updateService(service.id, {
        durationMinutes: draft.durationMinutes,
        name,
        price: draft.price,
      });
    } finally {
      setSaving(false);
    }
  };

  const removeService = async () => {
    if (!window.confirm(`确认删除“${service.name}”？已有预约里的服务文字和价格会保留。`)) {
      return;
    }
    await deleteService(service.id);
  };

  return (
    <article className="service-row">
      <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} aria-label="服务名称" />
      <input
        value={draft.price || ""}
        inputMode="decimal"
        onChange={(event) => setDraft((current) => ({ ...current, price: Number(event.target.value.replace(/[^\d.]/g, "")) }))}
        aria-label="服务价格"
      />
      <SelectSheetField
        compact
        label="服务时长"
        title="选择服务时长"
        value={draft.durationMinutes}
        options={durationSelectOptions}
        onChange={(value) => setDraft((current) => ({ ...current, durationMinutes: value }))}
      />
      <div className="service-row-actions">
        <button className="secondary-button" disabled={saving} type="button" onClick={saveService}>
          {saving ? "保存中" : "保存"}
        </button>
        <button className="delete-icon-button" type="button" aria-label={`删除${service.name}`} onClick={removeService}>
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
};

export default App;

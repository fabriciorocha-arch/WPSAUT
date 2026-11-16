import { BotScheduleSettings } from '../types/index.ts';

export const WEEKDAY_OPTIONS: Array<{ value: number; short: string; label: string }> = [
  { value: 0, short: 'Dom', label: 'Domingo' },
  { value: 1, short: 'Seg', label: 'Segunda-feira' },
  { value: 2, short: 'Ter', label: 'Terça-feira' },
  { value: 3, short: 'Qua', label: 'Quarta-feira' },
  { value: 4, short: 'Qui', label: 'Quinta-feira' },
  { value: 5, short: 'Sex', label: 'Sexta-feira' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
];

export const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'America/Sao_Paulo', label: 'Brasília / São Paulo (BRT)' },
  { value: 'America/Manaus', label: 'Manaus / Amazonas (AMT)' },
  { value: 'America/Fortaleza', label: 'Nordeste / Fortaleza (BRT)' },
  { value: 'America/Belem', label: 'Pará / Belém (BRT)' },
  { value: 'America/Cuiaba', label: 'Cuiabá / Mato Grosso (AMT)' },
  { value: 'America/Rio_Branco', label: 'Acre / Rio Branco (ACT)' },
];

export const DEFAULT_BOT_SCHEDULE: BotScheduleSettings = {
  enabled: false,
  activeDays: [1, 2, 3, 4, 5],
  startTime: '08:00',
  endTime: '18:00',
  timezone: 'America/Sao_Paulo',
  sendOffHoursMessage: false,
  offHoursMessage:
    'Olá! Nosso atendimento automático funciona nos dias e horários configurados. Assim que retornarmos, responderemos sua mensagem!',
};

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function parseTimeToMinutes(hhmm: string | undefined | null): number | null {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function getZonedDayAndTime(
  date: Date = new Date(),
  timeZone: string = 'America/Sao_Paulo'
): {
  dayOfWeek: number;
  minutesSinceMidnight: number;
  isoDate: string;
  hhmm: string;
} {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const weekdayStr = get('weekday');
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));

  const dayOfWeek = WEEKDAY_MAP[weekdayStr] ?? date.getDay();
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return {
    dayOfWeek,
    minutesSinceMidnight: hour * 60 + minute,
    isoDate: `${year}-${month}-${day}`,
    hhmm,
  };
}

export function isWithinBotSchedule(
  schedule: BotScheduleSettings | undefined,
  now: Date = new Date()
): {
  allowed: boolean;
  reason?: 'day_disabled' | 'outside_hours';
  currentDay: number;
  currentTime: string;
} {
  const tz = schedule?.timezone || DEFAULT_BOT_SCHEDULE.timezone;
  const zoned = getZonedDayAndTime(now, tz);

  if (!schedule || !schedule.enabled) {
    return {
      allowed: true,
      currentDay: zoned.dayOfWeek,
      currentTime: zoned.hhmm,
    };
  }

  const activeDays = Array.isArray(schedule.activeDays) ? schedule.activeDays : [];
  if (!activeDays.includes(zoned.dayOfWeek)) {
    return {
      allowed: false,
      reason: 'day_disabled',
      currentDay: zoned.dayOfWeek,
      currentTime: zoned.hhmm,
    };
  }

  const startMin = parseTimeToMinutes(schedule.startTime);
  const endMin = parseTimeToMinutes(schedule.endTime);

  if (startMin === null || endMin === null || startMin === endMin) {
    // Full day allowed if times are equal or unspecified
    return {
      allowed: true,
      currentDay: zoned.dayOfWeek,
      currentTime: zoned.hhmm,
    };
  }

  const cur = zoned.minutesSinceMidnight;
  const insideHours =
    startMin < endMin
      ? cur >= startMin && cur <= endMin
      : cur >= startMin || cur <= endMin; // supports overnight windows e.g. 22:00 -> 06:00

  if (!insideHours) {
    return {
      allowed: false,
      reason: 'outside_hours',
      currentDay: zoned.dayOfWeek,
      currentTime: zoned.hhmm,
    };
  }

  return {
    allowed: true,
    currentDay: zoned.dayOfWeek,
    currentTime: zoned.hhmm,
  };
}

export function isFollowUpAllowedToday(
  blockedDays: number[] | undefined,
  blockedDates: string[] | undefined,
  timeZone: string = 'America/Sao_Paulo',
  now: Date = new Date()
): {
  allowed: boolean;
  reason?: 'blocked_weekday' | 'blocked_date';
  currentDay: number;
  isoDate: string;
} {
  const zoned = getZonedDayAndTime(now, timeZone);

  if (Array.isArray(blockedDays) && blockedDays.includes(zoned.dayOfWeek)) {
    return {
      allowed: false,
      reason: 'blocked_weekday',
      currentDay: zoned.dayOfWeek,
      isoDate: zoned.isoDate,
    };
  }

  if (Array.isArray(blockedDates) && blockedDates.includes(zoned.isoDate)) {
    return {
      allowed: false,
      reason: 'blocked_date',
      currentDay: zoned.dayOfWeek,
      isoDate: zoned.isoDate,
    };
  }

  return {
    allowed: true,
    currentDay: zoned.dayOfWeek,
    isoDate: zoned.isoDate,
  };
}

export function formatScheduleSummary(schedule: BotScheduleSettings | undefined): string {
  if (!schedule || !schedule.enabled) {
    return '24 horas · Todos os dias';
  }
  const days = WEEKDAY_OPTIONS.filter((d) => schedule.activeDays?.includes(d.value)).map(
    (d) => d.short
  );
  if (days.length === 0) {
    return 'Nenhum dia ativo selecionado';
  }
  return `${days.join(', ')} · ${schedule.startTime} às ${schedule.endTime}`;
}

export function formatBlockedDaysSummary(
  blockedDays: number[] | undefined,
  blockedDates?: string[]
): string {
  const dayNames = WEEKDAY_OPTIONS.filter((d) => blockedDays?.includes(d.value)).map(
    (d) => d.short
  );
  const dateCount = Array.isArray(blockedDates) ? blockedDates.length : 0;

  if (dayNames.length === 0 && dateCount === 0) {
    return 'Nenhum dia bloqueado (envia todos os dias)';
  }

  const parts: string[] = [];
  if (dayNames.length > 0) parts.push(`Não envia: ${dayNames.join(', ')}`);
  if (dateCount > 0) parts.push(`${dateCount} data(s) específica(s)`);
  return parts.join(' · ');
}

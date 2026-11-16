import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimeToMinutes,
  isWithinBotSchedule,
  isFollowUpAllowedToday,
  formatScheduleSummary,
  formatBlockedDaysSummary,
} from './schedule-utils.ts';
import { shouldAiReplyToConversation } from './whatsapp-utils.ts';
import { BotScheduleSettings } from '../types/index.ts';

test('parseTimeToMinutes parses valid HH:MM strings and rejects invalid ones', () => {
  assert.equal(parseTimeToMinutes('08:00'), 480);
  assert.equal(parseTimeToMinutes('18:30'), 1110);
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('23:59'), 1439);
  assert.equal(parseTimeToMinutes('24:00'), null);
  assert.equal(parseTimeToMinutes('invalid'), null);
});

test('isWithinBotSchedule allows everything when schedule is disabled', () => {
  const res = isWithinBotSchedule(
    {
      enabled: false,
      activeDays: [1],
      startTime: '08:00',
      endTime: '12:00',
      timezone: 'America/Sao_Paulo',
    },
    new Date('2026-11-15T23:00:00Z') // Sunday
  );
  assert.equal(res.allowed, true);
});

test('isWithinBotSchedule enforces weekdays and daytime hours in America/Sao_Paulo', () => {
  const schedule: BotScheduleSettings = {
    enabled: true,
    activeDays: [1, 2, 3, 4, 5], // Seg a Sex
    startTime: '08:00',
    endTime: '18:00',
    timezone: 'America/Sao_Paulo',
  };

  // Friday 2026-11-13 at 14:30 BRT = 17:30 UTC -> allowed
  const fridayAfternoon = isWithinBotSchedule(schedule, new Date('2026-11-13T17:30:00Z'));
  assert.equal(fridayAfternoon.allowed, true);
  assert.equal(fridayAfternoon.currentDay, 5);

  // Friday 2026-11-13 at 19:30 BRT = 22:30 UTC -> outside hours
  const fridayNight = isWithinBotSchedule(schedule, new Date('2026-11-13T22:30:00Z'));
  assert.equal(fridayNight.allowed, false);
  assert.equal(fridayNight.reason, 'outside_hours');

  // Saturday 2026-11-14 at 10:00 BRT = 13:00 UTC -> day disabled
  const saturdayMorning = isWithinBotSchedule(schedule, new Date('2026-11-14T13:00:00Z'));
  assert.equal(saturdayMorning.allowed, false);
  assert.equal(saturdayMorning.reason, 'day_disabled');
});

test('isWithinBotSchedule supports overnight windows (e.g. 22:00 to 06:00)', () => {
  const nightSchedule: BotScheduleSettings = {
    enabled: true,
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    startTime: '22:00',
    endTime: '06:00',
    timezone: 'America/Sao_Paulo',
  };

  // 23:00 BRT = 02:00 UTC next day -> inside overnight window
  assert.equal(isWithinBotSchedule(nightSchedule, new Date('2026-11-14T02:00:00Z')).allowed, true);
  // 04:00 BRT = 07:00 UTC -> inside overnight window
  assert.equal(isWithinBotSchedule(nightSchedule, new Date('2026-11-14T07:00:00Z')).allowed, true);
  // 14:00 BRT = 17:00 UTC -> outside overnight window
  assert.equal(isWithinBotSchedule(nightSchedule, new Date('2026-11-14T17:00:00Z')).allowed, false);
});

test('isFollowUpAllowedToday blocks configured weekdays and specific dates', () => {
  // Friday 2026-11-13 12:00 BRT = 15:00 UTC
  const fridayNoon = new Date('2026-11-13T15:00:00Z');
  // Saturday 2026-11-14 12:00 BRT = 15:00 UTC
  const saturdayNoon = new Date('2026-11-14T15:00:00Z');
  // Sunday 2026-11-15 12:00 BRT = 15:00 UTC
  const sundayNoon = new Date('2026-11-15T15:00:00Z');

  // Block weekends (0 = Dom, 6 = Sáb)
  assert.equal(isFollowUpAllowedToday([0, 6], [], 'America/Sao_Paulo', fridayNoon).allowed, true);
  const satCheck = isFollowUpAllowedToday([0, 6], [], 'America/Sao_Paulo', saturdayNoon);
  assert.equal(satCheck.allowed, false);
  assert.equal(satCheck.reason, 'blocked_weekday');
  const sunCheck = isFollowUpAllowedToday([0, 6], [], 'America/Sao_Paulo', sundayNoon);
  assert.equal(sunCheck.allowed, false);
  assert.equal(sunCheck.reason, 'blocked_weekday');

  // Block specific holiday date
  const dateCheck = isFollowUpAllowedToday([], ['2026-11-13'], 'America/Sao_Paulo', fridayNoon);
  assert.equal(dateCheck.allowed, false);
  assert.equal(dateCheck.reason, 'blocked_date');
});

test('shouldAiReplyToConversation blocks replies when scheduleAllowed is false and formatters produce readable text', () => {
  assert.equal(
    shouldAiReplyToConversation({
      isGroup: false,
      customerAiEnabled: true,
      globalAutoReplyEnabled: true,
      groupAutoReplyEnabled: true,
      scheduleAllowed: false,
    }),
    false
  );

  assert.equal(formatScheduleSummary(undefined), '24 horas · Todos os dias');
  assert.match(
    formatScheduleSummary({
      enabled: true,
      activeDays: [1, 5],
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'America/Sao_Paulo',
    }),
    /Seg, Sex · 09:00 às 17:00/
  );
  assert.match(formatBlockedDaysSummary([0, 6], ['2026-12-25']), /Não envia: Dom, Sáb/);
});

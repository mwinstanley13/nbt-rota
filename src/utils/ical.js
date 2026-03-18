import { SLOTS } from '../constants/slots'
import { LEAVE_T } from '../constants/leaveTypes'
import { DEFAULT_SHIFT_TIMES } from '../constants/rules'

// Determine if a UK date string (YYYY-MM-DD) is in BST (UTC+1) or GMT (UTC+0)
// BST runs from last Sunday of March to last Sunday of October
function isBST(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const year = d.getUTCFullYear();
  // Last Sunday of March
  const bstStart = lastSunday(year, 2); // month index 2 = March
  // Last Sunday of October
  const bstEnd = lastSunday(year, 9);   // month index 9 = October
  return d >= bstStart && d < bstEnd;
}

function lastSunday(year, monthIndex) {
  // Find last Sunday of given month (0-indexed)
  const d = new Date(Date.UTC(year, monthIndex + 1, 0)); // last day of month
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 7) % 7)); // back to Sunday
  return d;
}

// Format a date+time to iCal UTC format: YYYYMMDDTHHMMSSZ
function toUTCIcal(dateStr, timeStr, overnight = false) {
  const [h, m] = timeStr.split(':').map(Number);
  const offset = isBST(dateStr) ? 1 : 0; // BST = UTC+1, so subtract 1h to get UTC
  let utcH = h - offset;
  let dateToUse = dateStr;
  if (overnight) {
    // End time is next day
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    dateToUse = d.toISOString().slice(0, 10);
    utcH = h - offset;
  }
  if (utcH < 0) {
    utcH += 24;
    const d = new Date(dateToUse + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    dateToUse = d.toISOString().slice(0, 10);
  }
  const date = dateToUse.replace(/-/g, '');
  const hh = String(utcH).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${date}T${hh}${mm}00Z`;
}

// iCal line folding (max 75 octets per line, continue with CRLF + SPACE)
function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < line.length) {
    if (start === 0) {
      // First chunk: up to 75 bytes
      let end = 75;
      while (new TextEncoder().encode(line.slice(0, end)).length > 75) end--;
      parts.push(line.slice(0, end));
      start = end;
    } else {
      // Continuation: up to 74 bytes (1 byte for leading space)
      let end = start + 74;
      while (end > start && new TextEncoder().encode(line.slice(start, end)).length > 74) end--;
      parts.push(' ' + line.slice(start, end));
      start = end;
    }
  }
  return parts.join('\r\n');
}

function escapeIcal(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

const GRP_LABEL = {
  EARLY:'Early', MID:'Mid', LATE:'Late',
  WE_EARLY:'W/E Early', WE_LATE:'W/E Late',
  NIGHT1:'Night (SDM 1)', NIGHT2:'Night (SDM 2)',
  ST3_NIGHT:'Night (ST3)', ACP_NIGHT:'Night (ACP)'
};

// Get effective shift times for a slot, respecting per-staff overrides
function getSlotTimes(slotKey, init, shiftTimes, staffShiftTimes) {
  return ((staffShiftTimes || {})[init] || {})[slotKey]
    || (shiftTimes || {})[slotKey]
    || DEFAULT_SHIFT_TIMES[slotKey]
    || { start: '08:00', end: '16:30' };
}

export function generateICS({ user, rota, leaveEntries, shiftTimes, staffShiftTimes, staff }) {
  const init = user.init;
  const staffRec = staff.find(s => s.init === init);
  const calName = `${staffRec?.name || init} — NBT Rota`;

  const events = [];
  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  // Rota shifts
  Object.entries(rota).forEach(([date, slots]) => {
    Object.entries(slots).forEach(([sk, assignedInit]) => {
      if (assignedInit !== init) return;
      const slot = SLOTS.find(s => s.key === sk);
      if (!slot) return;
      const times = getSlotTimes(sk, init, shiftTimes, staffShiftTimes);
      const grpLabel = slot.grp ? (GRP_LABEL[slot.grp] || slot.label) : slot.label;
      const isNight = sk.startsWith('N') || sk === 'SN' || sk === 'AN';
      const endIsNextDay = isNight || (times.end <= times.start && times.end !== '00:00') || times.end < times.start;
      const dtStart = toUTCIcal(date, times.start, false);
      const dtEnd = toUTCIcal(date, times.end, endIsNextDay || times.end === '00:00');
      const uid = `rota-${date}-${sk}-${init}@rotahst-nbt`;
      events.push([
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        foldLine(`SUMMARY:${escapeIcal(grpLabel + ' Shift — NBT')}`),
        foldLine(`DESCRIPTION:${escapeIcal(slot.label + ' shift\\nNorth Bristol Trust ED')}`),
        'LOCATION:North Bristol NHS Trust ED',
        'END:VEVENT',
      ].join('\r\n'));
    });
  });

  // Leave entries
  Object.entries(leaveEntries).forEach(([date, entries]) => {
    entries.forEach(e => {
      if (e.init !== init) return;
      const lt = LEAVE_T[e.type];
      if (!lt) return;
      // Leave entries are all-day events
      const dateCompact = date.replace(/-/g, '');
      const d = new Date(date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      const nextDay = d.toISOString().slice(0, 10).replace(/-/g, '');
      const uid = `leave-${date}-${e.type}-${init}-${e.id || Math.random().toString(36).slice(2)}@rotahst-nbt`;
      events.push([
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${dateCompact}`,
        `DTEND;VALUE=DATE:${nextDay}`,
        foldLine(`SUMMARY:${escapeIcal(lt.label + (e.note ? ' — ' + e.note : ''))}`),
        foldLine(`DESCRIPTION:${escapeIcal((lt.label || e.type) + '\\nNorth Bristol Trust')}`),
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      ].join('\r\n'));
    });
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RotaHST NBT//RotaHST//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeIcal(calName)}`),
    'X-WR-TIMEZONE:Europe/London',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return lines;
}

export function downloadICS(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

import { isWeekend, getSlotsForDay, getDatesInRange } from './dates.js';
import { QUARTERS } from '../constants/quarters.js';

export const normaliseAvailEntry = (entry) => {
  if (!entry) return null;

  // backwards compatibility with old string format
  if (typeof entry === "string") {
    if (entry === "AVAIL") return { base: "ANY", slots: [] };
    if (entry === "UNAVAIL") return { base: "UNAVAILABLE", slots: [] };
    if (entry === "SL") return { base: "SL", slots: [] };
    return null;
  }

  // old AVAILABLE base (manual slot checkboxes) → treat as ANY for backward compat
  // old AL base → treat as SL for backward compat (AL removed)
  let base = entry.base === "AVAILABLE" ? "ANY" : (entry.base || null);
  if (base === "AL") base = "SL";
  return { base, slots: Array.isArray(entry.slots) ? entry.slots : [] };
};

export const isMarkedAvailEntry = (entry) => {
  const e = normaliseAvailEntry(entry);
  return !!(e && e.base);
};

export const getAvailEntry = (availability, init, date) =>
  normaliseAvailEntry((availability[init] || {})[date]) || { base: null, slots: [] };

export const isBlockedDay = (availability, init, date) => {
  const e = getAvailEntry(availability, init, date);
  return e.base === "UNAVAILABLE" || e.base === "SL" || e.base === "MILITARY" || e.base === "PHEM";
};

// Maps an availability base + grade + date to the slot keys it covers
export const getSlotKeysForAvailBase = (base, grade, date) => {
  const we = isWeekend(date);
  switch (base) {
    case "ANY": return getSlotsForDay(date).map(s => s.key);
    case "EARLY": return we ? ["WE1","WE2","WE3"] : ["E1","E2","E3","E4"];
    case "MID":   return we ? [] : ["M1","M2","M3"];
    case "LATE":  return we ? ["WL1","WL2"] : ["L1","L2","L3","L4"];
    case "NIGHT":
      if (grade === "tACP") return ["AN"];
      if (grade === "ACP")  return ["N2","AN"];
      if (grade === "ST3")  return ["SN"];
      return ["N1","N2"]; // ST4+ default
    default: return [];
  }
};

export const isSlotPreferred = (availability, init, date, slotKey, grade) => {
  const e = getAvailEntry(availability, init, date);
  if (!e?.base) return false;
  const bases = e.base.split(",");
  const keys = bases.flatMap(b => getSlotKeysForAvailBase(b, grade, date));
  return keys.includes(slotKey);
};

export const getAutoSLEntriesForDate = (availability, date, staff) => {
  return staff
    .filter(s => s.role === "staff" && s.active)
    .filter(s => getAvailEntry(availability, s.init, date).base === "SL")
    .map(s => ({
      id: `auto-sl-${s.init}-${date}`,
      init: s.init,
      type: "SL",
      note: "Auto from availability",
      auto: true,
    }));
};

export const getMergedLeaveEntries = (date, leaveEntries, availability, staff) => {
  const manual = leaveEntries[date] || [];
  const manualSLInits = new Set(
    manual.filter(x => x.type === "SL").map(x => x.init)
  );
  const auto = getAutoSLEntriesForDate(availability, date, staff).filter(
    x => !manualSLInits.has(x.init)
  );
  return [...manual, ...auto];
};

export const staffHasAnythingOnDate = (init, date, rota, leaveEntries, availability, staff) => {
  const daySlots = rota[date] || {};
  const onShift = Object.values(daySlots).includes(init);
  const leave = getMergedLeaveEntries(date, leaveEntries, availability, staff).some(x => x.init === init);
  return onShift || leave;
};

// Generate realistic demo availability for Q1 — deterministic (seed = staff id)
export function generateDemoAvailability(staffList, quarters) {
  const q1 = (quarters||QUARTERS).find(q=>q.id==="Q1") || (quarters||QUARTERS)[0];
  if (!q1) return {};
  const dates = getDatesInRange(q1.start, q1.end);
  const avail = {};

  staffList.filter(s=>s.role==="staff"&&s.active).forEach(s => {
    avail[s.init] = {};
    const seed = s.id;
    const pattern = seed % 4;

    const hasResearchBlock = seed % 7 === 0;
    const blockStart = 14 + (seed % 12);
    const blockEnd   = blockStart + 20;

    dates.forEach((date, idx) => {
      const dow = new Date(date).getDay();
      const isWE = dow===0||dow===6;
      const weekNum = Math.floor(idx/7);

      if (hasResearchBlock && idx >= blockStart && idx <= blockEnd) {
        avail[s.init][date]={base:"UNAVAILABLE",slots:[]}; return;
      }

      if (!isWE && (idx + seed * 3) % 8 === 0) { avail[s.init][date]={base:"SL",slots:[]}; return; }
      if (!isWE && (idx + seed * 7 + 5) % 11 === 0) { avail[s.init][date]={base:"UNAVAILABLE",slots:[]}; return; }

      if (isWE && weekNum%3!==(seed%3)) { avail[s.init][date]={base:"UNAVAILABLE",slots:[]}; return; }

      if (pattern===0 && dow>=1&&dow<=4 && weekNum%2===(seed%2)) {
        avail[s.init][date]={base:"NIGHT",slots:[]}; return;
      }
      if (pattern===0 && (dow===5) && weekNum%2===(seed%2)) {
        avail[s.init][date]={base:"NIGHT",slots:[]}; return;
      }

      if (pattern===1 && !isWE && (idx+seed)%3===0) {
        avail[s.init][date]={base:"EARLY",slots:[]}; return;
      }
      if (pattern===2 && !isWE && (idx+seed)%3===1) {
        avail[s.init][date]={base:"LATE",slots:[]}; return;
      }
      if (pattern===3 && !isWE) {
        if ((idx+seed)%7===0) { avail[s.init][date]={base:"EARLY",slots:[]}; return; }
        if ((idx+seed)%7===3) { avail[s.init][date]={base:"LATE",slots:[]}; return; }
      }

      avail[s.init][date]={base:"ANY",slots:[]};
    });
  });
  return avail;
}

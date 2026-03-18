import { QUARTERS } from '../constants/quarters.js';
import { SLOT_HOURS, SLOT_GROUP_MAP, DEFAULT_GRADE_SLOT_HOURS, DEFAULT_PA_VALUES, NIGHT_SLOTS, WE_SLOTS, EARLY_SLOTS, MID_SLOTS, LATE_SLOTS } from '../constants/slots.js';
import { getDatesInRange } from './dates.js';

export const isACPGrade = grade => grade==="ACP"||grade==="tACP";
export const getSlotHours = (slotKey, grade) => { const h=SLOT_HOURS[slotKey]||{doc:0,acp:0}; return isACPGrade(grade)?h.acp:h.doc; };

// Get credited hours using configurable grade slot hours (falls back to SLOT_HOURS constant)
export const getSlotHoursConfigured = (slotKey, grade, gradeSlotHours) => {
  const grp = SLOT_GROUP_MAP[slotKey];
  if (grp && gradeSlotHours) {
    const gk = (grade==='ACP'||grade==='tACP') ? (grade==='tACP'?'tacp':'acp') : 'doc';
    const val = gradeSlotHours[gk]?.[grp];
    if (val != null) return val;
  }
  return getSlotHours(slotKey, grade);
};

// Get PA value for a slot
export const getSlotPAs = (slotKey, paSlotValues) => {
  const grp = SLOT_GROUP_MAP[slotKey];
  if (grp) return (paSlotValues || {})[grp] ?? DEFAULT_PA_VALUES[grp] ?? 1.0;
  return 1.0;
};

// Sum shift PAs for a PA-contract staff member
export const getShiftPAsUsed = (init, dates, rota, paSlotValues) => {
  let total = 0;
  dates.forEach(d => {
    const day = rota[d] || {};
    Object.entries(day).forEach(([sk, v]) => {
      if (v === init) total += getSlotPAs(sk, paSlotValues);
    });
  });
  return Math.round(total * 100) / 100;
};

// Is this staff member on a PA contract?
export const isPAStaff = s => !!(s?.pa);

// Budget for one person in one quarter — uses staffHours override, then hoursPerQuarter, then hoursPerWeek × 13
export const getStaffQuarterBudget = (init, grade, qid, wteConfig, staffHours) => {
  const override = staffHours[init] && staffHours[init][qid] != null ? staffHours[init][qid] : null;
  if (override !== null) return override;
  const cfg = wteConfig[grade] || wteConfig["ST4+"] || {};
  return cfg.hoursPerQuarter ?? Math.round((cfg.hoursPerWeek || 0) * 13 * 10) / 10;
};

// Sum shift hours for a person across given dates
export const getShiftHoursUsed = (init, grade, dates, rota, gradeSlotHours) => {
  let total = 0;
  dates.forEach(d => {
    const day = rota[d] || {};
    Object.entries(day).forEach(([sk, v]) => {
      if (v === init) total += getSlotHoursConfigured(sk, grade, gradeSlotHours);
    });
  });
  return Math.round(total * 10) / 10;
};

// Leave deduction: 8hrs per SL or Military leave day in the given dates
export const getLeaveHoursDeducted = (init, leaveEntries, dates) => {
  let total = 0;
  dates.forEach(d => {
    const entries = leaveEntries[d] || [];
    if (entries.some(e => e.init === init && (e.type === "SL" || e.type === "MILITARY"))) total += 8;
  });
  return total;
};

// Backward-compat alias
export const getSLHoursDeducted = getLeaveHoursDeducted;

// Sum of manual hours corrections for a person + quarter
export const getCorrectionsTotal = (init, qid, hoursCorrections) =>
  (hoursCorrections || []).filter(c => c.init === init && c.qid === qid).reduce((a, c) => a + c.amount, 0);

// Total carry-forward corrections for a person/quarter (carryForward:true flag)
export const getCarryForwardTotal = (init, qid, hoursCorrections) =>
  (hoursCorrections||[]).filter(c=>c.init===init&&c.qid===qid&&c.carryForward).reduce((s,c)=>s+c.amount,0);

// Hours remaining for a person in a quarter
export const getHoursRemaining = (init, grade, qid, wteConfig, staffHours, rota, leaveEntries, hoursCorrections, gradeSlotHours) => {
  const q = QUARTERS.find(x => x.id === qid);
  if (!q) return null;
  const dates = getDatesInRange(q.start, q.end);
  const budget = getStaffQuarterBudget(init, grade, qid, wteConfig, staffHours);
  const used = getShiftHoursUsed(init, grade, dates, rota, gradeSlotHours);
  const slDeduct = getLeaveHoursDeducted(init, leaveEntries, dates);
  const corrections = getCorrectionsTotal(init, qid, hoursCorrections);
  return Math.round((budget - used - slDeduct + corrections) * 10) / 10;
};

export function countShifts(init, dates, rota) {
  let nights=0, weekends=0, earlies=0, mids=0, lates=0;
  dates.forEach(d => {
    const day = rota[d] || {};
    Object.entries(day).forEach(([sk, v]) => {
      if (v !== init) return;
      if (NIGHT_SLOTS.has(sk))  nights++;
      if (WE_SLOTS.has(sk))     weekends++;
      if (EARLY_SLOTS.has(sk))  earlies++;
      if (MID_SLOTS.has(sk))    mids++;
      if (LATE_SLOTS.has(sk))   lates++;
    });
  });
  return {nights, weekends, earlies, mids, lates};
}

// Effective WTE = actual quarterly hours / grade full-time quarterly hours
export function getEffectiveWTE(init, grade, qid, wteConfig, staffHours) {
  const actual = getStaffQuarterBudget(init, grade, qid, wteConfig, staffHours);
  const cfg = wteConfig[grade] || wteConfig["ST4+"] || {};
  const full = cfg.hoursPerQuarter ?? Math.round((cfg.hoursPerWeek || 0) * 13 * 10) / 10;
  return full > 0 ? Math.round(actual / full * 100) / 100 : 1.0;
}

export function getTarget(wteConfig, grade, field, wte) {
  const cfg = wteConfig[grade] || wteConfig["ST4+"] || {};
  return Math.round((cfg[field] || 0) * wte * 10) / 10;
}

// Returns the grade key to use for hours/target config (Military flag overrides)
export const effGrade = s => (s && s.military) ? "Military" : (s?.grade || "ST4+");

// Returns target for a person, respecting per-quarter shift overrides
export const getPersonTarget = (wteConfig, s, field, wte, shiftOverrides, qid) => {
  const ov = shiftOverrides?.[s.init]?.[qid];
  if (ov && ov[field] != null) return ov[field];
  return getTarget(wteConfig, effGrade(s), field, wte);
};

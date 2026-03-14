// RotaHST Rota Generator — Netlify Serverless Function
// Fully deterministic: no Claude API needed.
// Nights → deterministic block scheduler (Mon-Thu / Fri-Sun blocks).
// Day shifts → greedy scheduler respecting rest, targets, grade rules, hours balance.

// ── Date / time helpers ───────────────────────────────────────────────────────

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dowOf(dateStr) {
  return new Date(dateStr + "T12:00:00Z").getUTCDay(); // 0=Sun,1=Mon..6=Sat
}

function diffDays(a, b) {
  return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
}

// Return shift start and end in minutes from midnight (end may be >1440 if overnight)
function shiftMinutes(times) {
  if (!times) return null;
  const [sh, sm] = times.start.split(":").map(Number);
  let [eh, em] = times.end.split(":").map(Number);
  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 1440; // overnight
  return { start: startMins, end: endMins };
}

// Gap in minutes between two shifts (prev end → next start, across date boundary)
function restGapMins(prevDate, prevTimes, nextDate, nextTimes) {
  if (!prevTimes || !nextTimes) return 99999;
  const prev = shiftMinutes(prevTimes);
  const next = shiftMinutes(nextTimes);
  if (!prev || !next) return 99999;
  const dayGap = diffDays(prevDate, nextDate);
  const nextStartAbsMins = dayGap * 1440 + next.start;
  return nextStartAbsMins - prev.end;
}

// ── Default shift times (used if not overridden) ──────────────────────────────

const DEFAULT_TIMES = {
  E1:{start:"08:00",end:"16:30"}, E2:{start:"08:00",end:"16:30"}, E3:{start:"08:00",end:"16:30"}, E4:{start:"08:00",end:"16:30"},
  M1:{start:"11:00",end:"20:00"}, M2:{start:"11:00",end:"20:00"}, M3:{start:"11:00",end:"20:00"},
  L1:{start:"16:00",end:"00:00"}, L2:{start:"16:00",end:"00:00"}, L3:{start:"16:00",end:"00:00"}, L4:{start:"16:00",end:"00:00"},
  WE1:{start:"08:00",end:"18:00"}, WE2:{start:"08:00",end:"18:00"}, WE3:{start:"08:00",end:"18:00"},
  WL1:{start:"14:00",end:"00:00"}, WL2:{start:"14:00",end:"00:00"},
  N1:{start:"22:00",end:"08:30"},  N2:{start:"22:00",end:"08:30"},
  SN:{start:"22:00",end:"08:30"},  AN:{start:"22:00",end:"08:30"},
};

function getTimes(slotKey, shiftTimes) {
  return (shiftTimes || {})[slotKey] || DEFAULT_TIMES[slotKey] || null;
}

// ── Night block scheduler ─────────────────────────────────────────────────────

function scheduleNights(body) {
  const { dates, staff, availability, targets, contractRules } = body;
  const maxConsec   = contractRules?.maxConsecNights    || 4;
  const postRestHrs = contractRules?.postNightRestHours || 46;
  const avMap = availability;

  const pools = {
    n1n2: staff.filter(s => s.grade === "ST4+"),
    sn:   staff.filter(s => s.grade === "ST3"),
    an:   staff.filter(s => ["ACP","tACP"].includes(s.grade)),
  };

  const state = {};
  staff.forEach(s => {
    state[s.init] = {
      nightCount: 0,
      target: targets[s.init]?.nights || 0,
      history: [],
    };
  });

  function isAvailableForNight(init, date) {
    const av = avMap[init] || {};
    return !(av.blocked?.includes(date) || av.earlyOnly?.includes(date) ||
             av.lateOnly?.includes(date) || av.midOnly?.includes(date));
  }

  function canDoBlock(init, blockDates) {
    if (!blockDates.every(d => isAvailableForNight(init, d))) return false;
    const hist = state[init].history;
    if (!hist.length) return true;
    const lastNight = hist[hist.length - 1];
    const gap = diffDays(lastNight, blockDates[0]);
    if (gap === 1) {
      let consec = 1;
      for (let i = hist.length - 2; i >= 0; i--) {
        if (diffDays(hist[i], hist[i + 1]) === 1) consec++; else break;
      }
      return consec + blockDates.length <= maxConsec;
    }
    if (gap > 1) {
      const lastEndMs  = new Date(lastNight + "T08:30:00Z").getTime() + 86400000;
      const newStartMs = new Date(blockDates[0] + "T22:00:00Z").getTime();
      return (newStartMs - lastEndMs) / 3600000 >= postRestHrs;
    }
    return false;
  }

  // required=true means this slot must be filled; use fallback if no one is under target
  function pickFromPool(pool, blockDates, exclude, required = false) {
    const is4 = blockDates.length >= 4;
    const is2 = blockDates.length === 2;
    const prefScore = p => is4 ? (p==="4"?2:p==="any"?1:0) : is2 ? (p==="2+2"?2:p==="any"?1:0) : 1;

    const sortFn = (a, b) => {
      const ps = prefScore(b.nightBlockPref||"any") - prefScore(a.nightBlockPref||"any");
      if (ps !== 0) return ps;
      const da = state[a.init].target - state[a.init].nightCount;
      const db = state[b.init].target - state[b.init].nightCount;
      return db !== da ? db - da : state[a.init].nightCount - state[b.init].nightCount;
    };

    // Hard cap: only pick people who are still under their night target
    const underTarget = pool.filter(s =>
      !exclude.has(s.init) &&
      canDoBlock(s.init, blockDates) &&
      state[s.init].nightCount < state[s.init].target
    );
    if (underTarget.length) {
      underTarget.sort(sortFn);
      return underTarget[0];
    }

    // Fallback for required slots (N1 / SDM only) — pick physically eligible person
    // even if at/over target; pick whoever has done the fewest nights
    if (required) {
      const fallback = pool.filter(s =>
        !exclude.has(s.init) && canDoBlock(s.init, blockDates)
      );
      if (fallback.length) {
        fallback.sort((a, b) => state[a.init].nightCount - state[b.init].nightCount);
        return fallback[0];
      }
    }

    return null; // slot stays empty (OK for N2 / SN / AN)
  }

  function record(person, blockDates, slot, nightRota) {
    blockDates.forEach(date => {
      if (!nightRota[date]) nightRota[date] = {};
      nightRota[date][slot] = person.init;
    });
    state[person.init].history.push(...blockDates);
    state[person.init].history.sort();
    state[person.init].nightCount += blockDates.length;
  }

  // Group dates by ISO week → weekday (Mon-Thu) and weekend (Fri-Sun) buckets
  const weekMap = {};
  [...dates].sort().forEach(d => {
    const dow = dowOf(d);
    const monday = addDays(d, -((dow + 6) % 7));
    if (!weekMap[monday]) weekMap[monday] = { weekday: [], weekend: [] };
    if (dow >= 1 && dow <= 4) weekMap[monday].weekday.push(d);
    if (dow === 5 || dow === 6 || dow === 0) weekMap[monday].weekend.push(d);
  });

  const nightRota = {};

  Object.keys(weekMap).sort().forEach(wk => {
    const { weekday, weekend } = weekMap[wk];

    if (weekday.length > 0) {
      const wd = weekday.sort();
      const canDo4   = pools.n1n2.filter(s => canDoBlock(s.init, wd));
      const pref2p2  = canDo4.filter(s => s.nightBlockPref === "2+2").length;
      const prefOth  = canDo4.filter(s => s.nightBlockPref !== "2+2").length;
      const subBlocks = (canDo4.length >= 2 && prefOth >= pref2p2) ? [wd] :
        wd.length > 2 ? [wd.slice(0, Math.ceil(wd.length/2)), wd.slice(Math.ceil(wd.length/2))] : [wd];

      subBlocks.forEach(sub => {
        const used = new Set();
        const n1 = pickFromPool(pools.n1n2, sub, used, true);  // N1 required — fallback allowed
        if (n1) { record(n1, sub, "N1", nightRota); used.add(n1.init); }
        const n2 = pickFromPool(pools.n1n2, sub, used, false); // N2 optional — hard cap
        if (n2) { record(n2, sub, "N2", nightRota); }
        const sn = pickFromPool(pools.sn, sub, new Set(), false); // SN optional — hard cap
        if (sn) { record(sn, sub, "SN", nightRota); }
        const an = pickFromPool(pools.an, sub, new Set(), false); // AN optional — hard cap
        if (an) { record(an, sub, "AN", nightRota); }
      });
    }

    if (weekend.length > 0) {
      const we = weekend.sort();
      const used = new Set();
      const n1 = pickFromPool(pools.n1n2, we, used, true);  // N1 required
      if (n1) { record(n1, we, "N1", nightRota); used.add(n1.init); }
      const n2 = pickFromPool(pools.n1n2, we, used, false); // N2 optional
      if (n2) { record(n2, we, "N2", nightRota); }
      const sn = pickFromPool(pools.sn, we, new Set(), false); // SN optional
      if (sn) { record(sn, we, "SN", nightRota); }
      const an = pickFromPool(pools.an, we, new Set(), false); // AN optional
      if (an) { record(an, we, "AN", nightRota); }
    }
  });

  return nightRota;
}

// ── Post-night rest blocked dates ─────────────────────────────────────────────

function getPostNightBlocked(nightRota, staff, postRestHrs) {
  const rest = postRestHrs || 46;
  const nightsByPerson = {};
  staff.forEach(s => { nightsByPerson[s.init] = []; });
  Object.entries(nightRota).forEach(([date, slots]) => {
    Object.values(slots).forEach(init => {
      if (init && nightsByPerson[init]) nightsByPerson[init].push(date);
    });
  });
  const blocked = {};
  staff.forEach(s => { blocked[s.init] = new Set(); });
  Object.entries(nightsByPerson).forEach(([init, dates]) => {
    if (!dates.length) return;
    const sorted = dates.sort();
    for (let i = 0; i < sorted.length; i++) {
      const isRunEnd = i === sorted.length - 1 || diffDays(sorted[i], sorted[i + 1]) !== 1;
      if (isRunEnd) {
        const runEndMs  = new Date(sorted[i] + "T08:30:00Z").getTime() + 86400000;
        const restEndMs = runEndMs + rest * 3600000;
        for (let off = 1; off <= 3; off++) {
          const candidate = addDays(sorted[i], off);
          if (new Date(candidate + "T08:00:00Z").getTime() < restEndMs) {
            blocked[init].add(candidate);
          }
        }
      }
    }
  });
  return blocked;
}

// ── Deterministic day shift scheduler ────────────────────────────────────────
// Fills E/M/L weekday slots and WE/WL weekend slots.
// Priority: required slots first (Pass 1), then additional slots to balance (Pass 2).
// Respects: 11h min rest, max 7 consec days, blocked dates, grade requirements,
//           availability preferences, quarterly shift targets (soft cap),
//           quarterly hours target (±8h soft cap).

function scheduleDayShifts(body, nightRota, postNightBlocked) {
  const {
    dates, staff, availability, targets, contractRules,
    slots: slotGrades, minStaffing, shiftTimes, dayTypes,
  } = body;

  const minRestHrs    = contractRules?.minRestHours || 11;
  const maxConsecDays = contractRules?.maxConsecWorkingDays || 7;
  const avMap         = availability;
  const nightSlots    = new Set(["N1","N2","SN","AN"]);
  const HOURS_BUFFER_MINS = 8 * 60; // ±8h tolerance on total hours

  // ── Shift duration helper ──
  function shiftDurMins(slotKey) {
    const t = getTimes(slotKey, shiftTimes);
    if (!t) return 480;
    const sm = shiftMinutes(t);
    return sm ? sm.end - sm.start : 480;
  }

  // ── Per-person tracking ──
  const pState = {};
  staff.forEach(s => {
    const tgt = targets[s.init] || {};
    pState[s.init] = {
      counts:      { earlies:0, mids:0, lates:0, weekends:0 },
      targets:     { earlies: tgt.earlies||0, mids: tgt.mids||0, lates: tgt.lates||0, weekends: tgt.weekends||0 },
      assignments: [],   // sorted [{date, slotKey}] — accurate rest checks across both passes
      workDates:   new Set(),
      minsWorked:  0,
      // hours target in minutes; fall back to estimating from count targets if not sent
      minsTarget:  tgt.hoursPerQuarter
        ? Math.round(tgt.hoursPerQuarter * 60)
        : Math.round(((tgt.nights||0)*630 + (tgt.earlies||0)*510 + (tgt.mids||0)*540 + (tgt.lates||0)*480)),
    };
  });

  // Seed working days + hours from night rota
  Object.entries(nightRota).forEach(([date, slots]) => {
    Object.entries(slots).forEach(([slotKey, init]) => {
      if (init && pState[init]) {
        pState[init].workDates.add(date);
        pState[init].minsWorked += shiftDurMins(slotKey);
      }
    });
  });

  // ── Helpers ──

  function st(slotKey) { return getTimes(slotKey, shiftTimes); }

  function shiftCat(slotKey) {
    if (["E1","E2","E3","E4","WE1","WE2","WE3"].includes(slotKey)) return "earlies";
    if (["M1","M2","M3"].includes(slotKey)) return "mids";
    if (["L1","L2","L3","L4","WL1","WL2"].includes(slotKey)) return "lates";
    return null;
  }

  function isBlocked(init, date) {
    const av = avMap[init] || {};
    return !!(av.blocked?.includes(date) || postNightBlocked[init]?.has(date));
  }

  function matchesPref(init, date, slotKey) {
    const av = avMap[init] || {};
    const cat = shiftCat(slotKey);
    if (av.earlyOnly?.includes(date)  && cat !== "earlies") return false;
    if (av.lateOnly?.includes(date)   && cat !== "lates")   return false;
    if (av.midOnly?.includes(date)    && cat !== "mids")    return false;
    if (av.nightOnly?.includes(date))                       return false; // NIGHT pref = no day shifts
    return true;
  }

  // Find the most-recent assignment strictly before `date`
  function lastAssignmentBefore(init, date) {
    const asgns = pState[init].assignments;
    for (let i = asgns.length - 1; i >= 0; i--) {
      if (asgns[i].date < date) return asgns[i];
    }
    return null;
  }

  // Find the next assignment strictly after `date`
  function nextAssignmentAfter(init, date) {
    const asgns = pState[init].assignments;
    for (let i = 0; i < asgns.length; i++) {
      if (asgns[i].date > date) return asgns[i];
    }
    return null;
  }

  function hasEnoughRest(init, date, slotKey) {
    // Check rest from the previous shift (if any)
    const prev = lastAssignmentBefore(init, date);
    if (prev) {
      const gap = restGapMins(prev.date, st(prev.slotKey), date, st(slotKey));
      if (gap < minRestHrs * 60) return false;
    }
    // Check rest into the next shift (if any) — prevents wedging between two close shifts
    const next = nextAssignmentAfter(init, date);
    if (next) {
      const gap = restGapMins(date, st(slotKey), next.date, st(next.slotKey));
      if (gap < minRestHrs * 60) return false;
    }
    return true;
  }

  function withinConsecLimit(init, date) {
    const wd = pState[init].workDates;
    if (!wd.has(addDays(date, -1))) return true; // didn't work yesterday
    let streak = 1;
    let d = addDays(date, -1);
    while (wd.has(addDays(d, -1)) && streak < maxConsecDays) { d = addDays(d, -1); streak++; }
    return streak < maxConsecDays;
  }

  // Slot type for day (excluding nights)
  function slotsForDay(dt) {
    if (dt === "weekend") return ["WE1","WE2","WE3","WL1","WL2"];
    return ["E1","E2","E3","E4","M1","M2","M3","L1","L2","L3","L4"];
  }

  function requiredForDay(dt) {
    return ((minStaffing || {})[dt] || []).filter(s => !nightSlots.has(s));
  }

  function pickForSlot(date, slotKey, assignedToday) {
    const gradeOk = new Set((slotGrades || {})[slotKey] || ["ST4+","ST3","ACP","tACP"]);
    const isWE = dowOf(date) === 0 || dowOf(date) === 6;
    const cat = shiftCat(slotKey);
    const dur = shiftDurMins(slotKey);

    // Two passes: first avoids over-target, second allows it (for required coverage)
    for (const allowOver of [false, true]) {
      const eligible = staff.filter(s => {
        if (assignedToday.has(s.init)) return false;
        if (!gradeOk.has(s.grade)) return false;
        if (isBlocked(s.init, date)) return false;
        if (!matchesPref(s.init, date, slotKey)) return false;
        if (!hasEnoughRest(s.init, date, slotKey)) return false;
        if (!withinConsecLimit(s.init, date)) return false;
        if (!allowOver) {
          // Soft cap on shift-type count: skip if 2+ over quarterly target
          if (cat) {
            const over = pState[s.init].counts[cat] - pState[s.init].targets[cat];
            if (over >= 2) return false;
          }
          if (isWE) {
            const wkOver = pState[s.init].counts.weekends - pState[s.init].targets.weekends;
            if (wkOver >= 2) return false;
          }
          // Hours cap: skip if adding this shift would take them >8h over their hours target
          if (pState[s.init].minsTarget > 0) {
            const over = pState[s.init].minsWorked + dur - pState[s.init].minsTarget;
            if (over > HOURS_BUFFER_MINS) return false;
          }
        }
        return true;
      });

      if (!eligible.length) continue;

      eligible.sort((a, b) => {
        const sa = pState[a.init], sb = pState[b.init];
        // Primary: highest deficit for this slot category
        if (cat) {
          const da = sa.targets[cat] - sa.counts[cat];
          const db = sb.targets[cat] - sb.counts[cat];
          if (da !== db) return db - da;
        }
        // Hours balance: most hours under target gets priority (if meaningful difference)
        if (sa.minsTarget > 0 && sb.minsTarget > 0) {
          const ha = sa.minsTarget - sa.minsWorked;
          const hb = sb.minsTarget - sb.minsWorked;
          if (Math.abs(ha - hb) > 30) return hb - ha;
        }
        // Weekend deficit
        if (isWE) {
          const dwa = sa.targets.weekends - sa.counts.weekends;
          const dwb = sb.targets.weekends - sb.counts.weekends;
          if (dwa !== dwb) return dwb - dwa;
        }
        // Fallback: fewest total shifts assigned
        const totA = sa.counts.earlies + sa.counts.mids + sa.counts.lates;
        const totB = sb.counts.earlies + sb.counts.mids + sb.counts.lates;
        return totA - totB;
      });

      return eligible[0];
    }
    return null;
  }

  const dayRota = {};
  const sortedDates = [...dates].sort();

  // assignedPerDay tracks who is already working each day (nights + day assignments so far)
  const assignedPerDay = {};
  sortedDates.forEach(date => {
    assignedPerDay[date] = new Set(Object.values(nightRota[date] || {}).filter(Boolean));
    dayRota[date] = {};
  });

  function assign(date, slotKey, person) {
    const isWE = dowOf(date) === 0 || dowOf(date) === 6;
    dayRota[date][slotKey] = person.init;
    assignedPerDay[date].add(person.init);
    const cat = shiftCat(slotKey);
    if (cat) pState[person.init].counts[cat]++;
    if (isWE) pState[person.init].counts.weekends++;
    // Track hours
    pState[person.init].minsWorked += shiftDurMins(slotKey);
    // Insert into sorted assignments list (binary-search insertion to keep order)
    const asgns = pState[person.init].assignments;
    let lo = 0, hi = asgns.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (asgns[mid].date <= date) lo = mid + 1; else hi = mid;
    }
    asgns.splice(lo, 0, { date, slotKey });
    pState[person.init].workDates.add(date);
  }

  function dtFor(date) {
    const dow = dowOf(date);
    const isWE = dow === 0 || dow === 6;
    return (dayTypes || {})[date] ||
      (isWE ? "weekend" : dow === 1 ? "monday" : dow === 5 ? "friday" : "weekday_other");
  }

  // ── PASS 1: fill every REQUIRED slot across all dates ──────────────────────
  // Guarantees minimum staffing before any extra shifts are added.
  sortedDates.forEach(date => {
    const required = requiredForDay(dtFor(date));
    required.forEach(slotKey => {
      if (dayRota[date][slotKey]) return; // already filled
      const person = pickForSlot(date, slotKey, assignedPerDay[date]);
      if (person) assign(date, slotKey, person);
    });
  });

  // ── PASS 2: fill optional/additional slots to balance workload ─────────────
  sortedDates.forEach(date => {
    const dt = dtFor(date);
    const required = new Set(requiredForDay(dt));
    const optional = slotsForDay(dt).filter(s => !required.has(s));
    optional.forEach(slotKey => {
      if (dayRota[date][slotKey]) return;
      const person = pickForSlot(date, slotKey, assignedPerDay[date]);
      if (person) assign(date, slotKey, person);
    });
  });

  return dayRota;
}

// ── Validate merged rota ──────────────────────────────────────────────────────

function validateRota(rota, body) {
  const { staff, availability, shiftTimes, contractRules } = body;
  const conflicts = [];
  const staffMap = Object.fromEntries(staff.map(s => [s.init, s]));
  const postRestHrs = contractRules?.postNightRestHours || 46;
  const minRestHrs  = contractRules?.minRestHours || 11;

  const personAsgns = {};
  staff.forEach(s => { personAsgns[s.init] = []; });

  Object.entries(rota).forEach(([date, daySlots]) => {
    const seen = {};
    Object.entries(daySlots).forEach(([slotKey, init]) => {
      if (!init) return;
      const person = staffMap[init];
      if (!person) { conflicts.push({ date, slot: slotKey, init, rule: "Unknown initials", severity: "error" }); return; }
      const av = availability[init] || {};
      if (av.blocked?.includes(date)) conflicts.push({ date, slot: slotKey, init, rule: `${init} blocked on ${date}`, severity: "error" });
      if (seen[init]) conflicts.push({ date, slot: slotKey, init, rule: `${init} assigned twice on ${date}`, severity: "error" });
      seen[init] = slotKey;
      const isNight = ["N1","N2","SN","AN"].includes(slotKey);
      if (personAsgns[init]) personAsgns[init].push({ date, slotKey, isNight });
    });
  });

  // Check rest and consecutive nights
  const maxNights = contractRules?.maxConsecNights || 4;
  Object.entries(personAsgns).forEach(([init, asgns]) => {
    const sorted = asgns.sort((a, b) => a.date.localeCompare(b.date));
    let consecNights = 0, lastNightDate = null, lastNonNight = null;

    sorted.forEach(a => {
      if (a.isNight) {
        const gap = lastNightDate ? diffDays(lastNightDate, a.date) : null;
        if (gap === 1) { consecNights++; }
        else {
          if (lastNightDate && consecNights > 0) {
            const restEnd = new Date(lastNightDate + "T08:30:00Z").getTime() + 86400000 + postRestHrs * 3600000;
            if (new Date(a.date + "T22:00:00Z").getTime() < restEnd)
              conflicts.push({ date: a.date, slot: a.slotKey, init, rule: `Insufficient post-night rest before new night block`, severity: "error" });
          }
          consecNights = 1;
        }
        lastNightDate = a.date;
        if (consecNights > maxNights)
          conflicts.push({ date: a.date, slot: a.slotKey, init, rule: `${consecNights} consecutive nights (max ${maxNights})`, severity: "error" });
      } else {
        if (lastNightDate) {
          const restEnd = new Date(lastNightDate + "T08:30:00Z").getTime() + 86400000 + postRestHrs * 3600000;
          if (new Date(a.date + "T08:00:00Z").getTime() < restEnd)
            conflicts.push({ date: a.date, slot: a.slotKey, init, rule: `Working within ${postRestHrs}h post-night rest period`, severity: "error" });
        }
        // Check 11h rest from previous non-night shift
        if (lastNonNight) {
          const gap = restGapMins(lastNonNight.date, getTimes(lastNonNight.slotKey, shiftTimes), a.date, getTimes(a.slotKey, shiftTimes));
          if (gap < minRestHrs * 60)
            conflicts.push({ date: a.date, slot: a.slotKey, init, rule: `Only ${Math.round(gap/60)}h rest (need ${minRestHrs}h)`, severity: "warning" });
        }
        consecNights = 0; lastNightDate = null;
        lastNonNight = a;
      }
    });
  });

  return conflicts;
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) }; }

  try {
    // 1. Schedule nights deterministically (hard cap per person; N1 has fallback)
    const nightRota = scheduleNights(body);

    // 2. Calculate post-night rest blocked dates
    const postNightBlocked = getPostNightBlocked(
      nightRota, body.staff, body.contractRules?.postNightRestHours || 46
    );

    // 3. Schedule day shifts deterministically (hours-balanced, rest-safe)
    const dayRota = scheduleDayShifts(body, nightRota, postNightBlocked);

    // 4. Merge: night slots + day slots (night slots take priority)
    const requestedDates = new Set(body.dates || []);
    const merged = {};
    const nightSlotKeys = new Set(["N1","N2","SN","AN"]);

    body.dates.forEach(date => {
      if (!requestedDates.has(date)) return;
      merged[date] = {
        ...(dayRota[date] || {}),
        ...(nightRota[date] || {}), // nights overwrite any day slot collision
      };
      // Remove any day slot accidentally assigned to a person also on nights today
      const nightStaff = new Set(Object.values(nightRota[date] || {}).filter(Boolean));
      Object.entries(merged[date]).forEach(([slot, init]) => {
        if (!nightSlotKeys.has(slot) && nightStaff.has(init)) {
          delete merged[date][slot];
        }
      });
    });

    // 5. Validate
    const conflicts = validateRota(merged, body);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ rota: merged, conflicts }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: `Scheduler error: ${err.message}` }),
    };
  }
};

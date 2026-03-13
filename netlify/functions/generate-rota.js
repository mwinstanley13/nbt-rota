// RotaHST AI Rota Generator — Netlify Serverless Function
// Nights are scheduled deterministically (blocks, rest rules, grade matching).
// Claude handles day shifts only (simpler problem, more reliable output).

// ── Date helpers ──────────────────────────────────────────────────────────────

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

function shiftDurationHours(times) {
  if (!times) return 0;
  const [sh, sm] = times.start.split(":").map(Number);
  const [eh, em] = times.end.split(":").map(Number);
  let h = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (h <= 0) h += 24;
  return h;
}

// ── Night block scheduler (deterministic) ────────────────────────────────────
// Groups dates into Mon–Thu and Fri–Sun blocks. Picks eligible staff by grade,
// balancing toward targets, respecting post-night rest and max-consecutive rules.

function scheduleNights(body) {
  const { dates, staff, availability, targets, contractRules } = body;
  const maxConsec   = contractRules?.maxConsecNights    || 4;
  const postRestHrs = contractRules?.postNightRestHours || 46;

  const avMap = availability; // {init:{blocked[],earlyOnly[],lateOnly[],midOnly[],nightOnly[]}}

  // ── Pools by grade ──
  const pools = {
    n1n2: staff.filter(s => s.grade === "ST4+"),
    sn:   staff.filter(s => s.grade === "ST3"),
    an:   staff.filter(s => ["ACP","tACP"].includes(s.grade)),
  };

  // ── Per-person state ──
  const state = {};
  staff.forEach(s => {
    state[s.init] = {
      nightCount: 0,
      target:     targets[s.init]?.nights || 0,
      history:    [], // sorted assigned night dates
    };
  });

  // ── Helpers ──

  function isAvailableForNight(init, date) {
    const av = avMap[init] || {};
    if (av.blocked?.includes(date))   return false;
    if (av.earlyOnly?.includes(date)) return false;
    if (av.lateOnly?.includes(date))  return false;
    if (av.midOnly?.includes(date))   return false;
    // If nightOnly is set and this date is not in it, person prefers nights only on specific days
    // We still allow assigning (nightOnly = "I want nights on these days" not "only nights ever")
    return true;
  }

  function canDoBlock(init, blockDates) {
    if (!blockDates.every(d => isAvailableForNight(init, d))) return false;

    const hist = state[init].history;
    if (hist.length === 0) return true;

    const lastNight = hist[hist.length - 1];
    const firstProposed = blockDates[0];
    const gap = diffDays(lastNight, firstProposed);

    if (gap === 1) {
      // Extending existing run — check max consecutive
      let consec = 1;
      for (let i = hist.length - 2; i >= 0; i--) {
        if (diffDays(hist[i], hist[i + 1]) === 1) consec++;
        else break;
      }
      // blockDates could add more consecutive nights
      return consec + blockDates.length <= maxConsec;
    }

    if (gap > 1) {
      // New block — check post-night rest
      // Last night shift ends at 08:30 the morning AFTER lastNight date
      const lastNightEndMs = new Date(lastNight + "T08:30:00Z").getTime() + 86400000;
      const newBlockStartMs = new Date(firstProposed + "T22:00:00Z").getTime();
      const restHours = (newBlockStartMs - lastNightEndMs) / 3600000;
      return restHours >= postRestHrs;
    }

    return false; // gap <= 0 (same or earlier date)
  }

  function pickFromPool(pool, blockDates, exclude) {
    const eligible = pool.filter(s => !exclude.has(s.init) && canDoBlock(s.init, blockDates));
    if (!eligible.length) return null;
    // Sort by highest deficit (target - count) desc, then lowest count desc
    eligible.sort((a, b) => {
      const da = state[a.init].target - state[a.init].nightCount;
      const db = state[b.init].target - state[b.init].nightCount;
      return db !== da ? db - da : state[a.init].nightCount - state[b.init].nightCount;
    });
    return eligible[0];
  }

  function recordAssignment(person, blockDates, slot, nightRota) {
    blockDates.forEach(date => {
      if (!nightRota[date]) nightRota[date] = {};
      nightRota[date][slot] = person.init;
    });
    state[person.init].history.push(...blockDates);
    state[person.init].history.sort();
    state[person.init].nightCount += blockDates.length;
  }

  // ── Group dates into night blocks by ISO week ──
  // Weekday nights: Mon(1)–Thu(4); Weekend nights: Fri(5)–Sat(6)–Sun(0)

  const weekMap = {}; // "2026-08-03" (Mon of ISO week) → {weekday:[], weekend:[]}
  const sortedDates = [...dates].sort();

  sortedDates.forEach(d => {
    const dow = dowOf(d);
    const daysSinceMon = (dow + 6) % 7;
    const monday = addDays(d, -daysSinceMon);
    if (!weekMap[monday]) weekMap[monday] = { weekday: [], weekend: [] };
    if (dow >= 1 && dow <= 4) weekMap[monday].weekday.push(d);
    if (dow === 5 || dow === 6 || dow === 0) weekMap[monday].weekend.push(d);
  });

  const nightRota = {};

  Object.keys(weekMap).sort().forEach(wk => {
    const { weekday, weekend } = weekMap[wk];

    // ── Weekday block (Mon–Thu, up to 4 nights) ──
    if (weekday.length > 0) {
      const wd = weekday.sort();

      // Determine sub-blocks: try full block first; split 2+2 if < 2 eligible
      const canDo4 = pools.n1n2.filter(s => canDoBlock(s.init, wd));
      let subBlocks = canDo4.length >= 2 ? [wd] : splitBlock(wd);

      subBlocks.forEach(sub => {
        const used = new Set();

        const n1 = pickFromPool(pools.n1n2, sub, used);
        if (n1) { recordAssignment(n1, sub, "N1", nightRota); used.add(n1.init); }

        const n2 = pickFromPool(pools.n1n2, sub, used);
        if (n2) { recordAssignment(n2, sub, "N2", nightRota); }

        const sn = pickFromPool(pools.sn, sub, new Set());
        if (sn) { recordAssignment(sn, sub, "SN", nightRota); }

        const an = pickFromPool(pools.an, sub, new Set());
        if (an) { recordAssignment(an, sub, "AN", nightRota); }
      });
    }

    // ── Weekend block (Fri–Sat–Sun, up to 3 nights) ──
    if (weekend.length > 0) {
      const we = weekend.sort();
      const used = new Set();

      const n1 = pickFromPool(pools.n1n2, we, used);
      if (n1) { recordAssignment(n1, we, "N1", nightRota); used.add(n1.init); }

      const n2 = pickFromPool(pools.n1n2, we, used);
      if (n2) { recordAssignment(n2, we, "N2", nightRota); }

      const sn = pickFromPool(pools.sn, we, new Set());
      if (sn) { recordAssignment(sn, we, "SN", nightRota); }

      const an = pickFromPool(pools.an, we, new Set());
      if (an) { recordAssignment(an, we, "AN", nightRota); }
    }
  });

  return nightRota;
}

// Split a block of dates into two halves (2+2 split)
function splitBlock(dates) {
  const mid = Math.ceil(dates.length / 2);
  const a = dates.slice(0, mid);
  const b = dates.slice(mid);
  return b.length > 0 ? [a, b] : [a];
}

// ── Post-night rest blocked dates ─────────────────────────────────────────────
// Returns {init: Set<date>} where each date is blocked for day shifts because
// it falls within the 46-hr rest window after a night run ends.

function getPostNightBlocked(nightRota, staff, postRestHrs) {
  const rest = postRestHrs || 46;
  const nightsByPerson = {}; // init → sorted night dates
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
      const isRunEnd = i === sorted.length - 1 ||
        diffDays(sorted[i], sorted[i + 1]) !== 1;

      if (isRunEnd) {
        // Night ends at 08:30 the morning after the last date
        const runEndMs = new Date(sorted[i] + "T08:30:00Z").getTime() + 86400000;
        const restEndsMs = runEndMs + rest * 3600000;

        // Block any date whose early shift (08:00) starts before rest ends
        for (let offset = 1; offset <= 3; offset++) {
          const candidate = addDays(sorted[i], offset);
          const earlyStartMs = new Date(candidate + "T08:00:00Z").getTime();
          if (earlyStartMs < restEndsMs) {
            blocked[init].add(candidate);
          }
        }
      }
    }
  });

  return blocked; // init → Set of blocked day-shift dates
}

// ── Build prompt for Claude (day shifts only) ─────────────────────────────────

const short = d => d.slice(5); // "2026-08-05" → "08-05"

function buildDayPrompt(body, nightRota, postNightBlocked) {
  const { dates, staff, availability, targets, contractRules, minStaffing } = body;

  // Who is on nights each day
  const onNightsPerDay = {}; // date → Set of inits
  Object.entries(nightRota).forEach(([date, slots]) => {
    onNightsPerDay[date] = new Set(Object.values(slots).filter(Boolean));
  });

  // Staff lines
  const staffLines = staff.map(s => {
    const av = availability[s.init] || {};
    const parts = [`${s.init}(${s.grade})`];

    const xDates = dates.filter(d => {
      if (av.blocked?.includes(d)) return true;
      if (onNightsPerDay[d]?.has(s.init)) return true;          // on nights this day
      if (postNightBlocked[s.init]?.has(d)) return true;        // post-night rest
      return false;
    }).map(short);

    const ea = (av.earlyOnly || []).filter(d => dates.includes(d)).map(short);
    const la = (av.lateOnly  || []).filter(d => dates.includes(d)).map(short);
    const mi = (av.midOnly   || []).filter(d => dates.includes(d)).map(short);

    if (xDates.length) parts.push(`X:${xDates.join(",")}`);
    if (ea.length) parts.push(`E:${ea.join(",")}`);
    if (la.length) parts.push(`L:${la.join(",")}`);
    if (mi.length) parts.push(`M:${mi.join(",")}`);
    return parts.join("|");
  }).join("\n");

  // Targets (day shifts only)
  const targetLines = staff.map(s => {
    const t = targets[s.init] || {};
    return `${s.init}:e${t.earlies||0}m${t.mids||0}l${t.lates||0}w${t.weekends||0}`;
  }).join(" ");

  // Min staffing (exclude night slots)
  const nightSlots = new Set(["N1","N2","SN","AN"]);
  const minLines = Object.entries(minStaffing || {})
    .map(([day, slts]) => `${day}:${slts.filter(s => !nightSlots.has(s)).join(",")}`)
    .filter(l => !l.endsWith(":"))
    .join(" | ");

  const dr = `${dates[0]} to ${dates[dates.length-1]}`;
  const cr = contractRules || {};

  return `NHS ED day-shift rota. Fill ONLY day slots (no nights). Date range: ${dr}.

SLOTS
Weekday: E1 E2 E3 E4(08-16:30) M1 M2 M3(11-20) L1 L2 L3 L4(16-00)
Weekend: WE1 WE2 WE3(08-18) WL1 WL2(14-00)
Grade rules: E1-E4,M1-M3,L1-L4,WE1-WE3,WL1-WL2 → any grade OK

MIN STAFFING PER DAY: ${minLines}

HARD RULES:
- 11h min rest between shifts (so no Late→Early next day)
- Max 13h shift | Max 7 consec working days
- 1 slot per person per day
- X=blocked (SL/unavail/on-nights/post-night-rest) — do NOT assign

SOFT: balance toward targets; spread evenly; avoid same slot >3 days running

STAFF (X=blocked E=earlyOnly L=lateOnly M=midOnly):
${staffLines}

DAY TARGETS (e=earlies m=mids l=lates w=weekends):
${targetLines}

Return ONLY valid JSON. Format: {"2026-08-05":{"E1":"MC","L1":"EB","M1":"SJ"},...}
Use correct slot keys. Weekends: WE1/WE2/WE3/WL1/WL2 only (not E or L). Omit unfillable slots.`;
}

// ── Validate merged rota ──────────────────────────────────────────────────────

function validateRota(rota, body) {
  const { dates, staff, availability, shiftTimes, contractRules } = body;
  const conflicts = [];
  const staffMap = Object.fromEntries(staff.map(s => [s.init, s]));
  const postRestHrs = contractRules?.postNightRestHours || 46;

  // Per-person assignment list
  const personAssignments = {};
  staff.forEach(s => { personAssignments[s.init] = []; });

  Object.entries(rota).forEach(([date, daySlots]) => {
    const seen = {};
    Object.entries(daySlots).forEach(([slotKey, init]) => {
      if (!init) return;
      const person = staffMap[init];
      if (!person) {
        conflicts.push({ date, slot: slotKey, init, rule: `Unknown initials`, severity: "error" });
        return;
      }
      const av = availability[init] || {};
      if (av.blocked?.includes(date)) {
        conflicts.push({ date, slot: slotKey, init, rule: `${init} blocked on ${date}`, severity: "error" });
      }
      if (seen[init]) {
        conflicts.push({ date, slot: slotKey, init, rule: `${init} assigned twice on ${date}`, severity: "error" });
      }
      seen[init] = slotKey;

      const dow = dowOf(date);
      const isWE = dow === 0 || dow === 6;
      const isNight = ["N1","N2","SN","AN"].includes(slotKey);
      const dur = shiftTimes?.[slotKey] ? shiftDurationHours(shiftTimes[slotKey]) : 0;
      if (personAssignments[init]) {
        personAssignments[init].push({ date, slotKey, isNight, isLong: dur > 10, isWE });
      }
    });
  });

  // Consecutive nights & post-night rest
  const maxNights = contractRules?.maxConsecNights || 4;
  Object.entries(personAssignments).forEach(([init, asgns]) => {
    const sorted = asgns.sort((a, b) => a.date.localeCompare(b.date));
    let consecNights = 0;
    let lastNightDate = null;

    sorted.forEach(a => {
      if (a.isNight) {
        const prev = lastNightDate ? diffDays(lastNightDate, a.date) : null;
        if (prev === 1) {
          consecNights++;
        } else {
          // New block — check rest
          if (lastNightDate && consecNights > 0) {
            const lastNightEndMs = new Date(lastNightDate + "T08:30:00Z").getTime() + 86400000;
            const newNightStartMs = new Date(a.date + "T22:00:00Z").getTime();
            const restHrs = (newNightStartMs - lastNightEndMs) / 3600000;
            if (restHrs < postRestHrs) {
              conflicts.push({ date: a.date, slot: a.slotKey, init, rule: `Only ${Math.round(restHrs)}h rest after nights (need ${postRestHrs}h)`, severity: "error" });
            }
          }
          consecNights = 1;
        }
        lastNightDate = a.date;
        if (consecNights > maxNights) {
          conflicts.push({ date: a.date, slot: a.slotKey, init, rule: `${init} has ${consecNights} consecutive nights (max ${maxNights})`, severity: "error" });
        }
      } else {
        if (lastNightDate && consecNights > 0) {
          const lastNightEndMs = new Date(lastNightDate + "T08:30:00Z").getTime() + 86400000;
          const shiftStartMs = new Date(a.date + "T08:00:00Z").getTime();
          const restHrs = (shiftStartMs - lastNightEndMs) / 3600000;
          if (restHrs < postRestHrs) {
            conflicts.push({ date: a.date, slot: a.slotKey, init, rule: `${init} working only ${Math.round(restHrs)}h after nights (need ${postRestHrs}h)`, severity: "error" });
          }
        }
        consecNights = 0;
        lastNightDate = null;
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set in Netlify environment variables." }),
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) }; }

  // ── 1. Schedule nights deterministically ──
  const nightRota = scheduleNights(body);

  // ── 2. Calculate post-night rest blocked dates ──
  const postNightBlocked = getPostNightBlocked(
    nightRota, body.staff, body.contractRules?.postNightRestHours || 46
  );

  // ── 3. Ask Claude for day shifts only ──
  const dayPrompt = buildDayPrompt(body, nightRota, postNightBlocked);

  let claudeRes;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 8192,
        messages: [{ role: "user", content: dayPrompt }],
      }),
    });
  } catch (e) {
    // Return nights-only rota even if Claude fails
    const conflicts = validateRota(nightRota, body);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ rota: nightRota, conflicts, warning: `Claude unavailable: ${e.message}. Night shifts generated; day shifts not filled.` }),
    };
  }

  const claudeData = await claudeRes.json();

  if (!claudeRes.ok) {
    const conflicts = validateRota(nightRota, body);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        rota: nightRota,
        conflicts,
        warning: `Claude error (${claudeData.error?.type}): ${claudeData.error?.message}. Night shifts generated; day shifts not filled.`,
      }),
    };
  }

  const text = claudeData.content?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  let dayRota = {};

  if (jsonMatch) {
    try { dayRota = JSON.parse(jsonMatch[0]); }
    catch (e) { /* ignore parse error; use nights only */ }
  }

  // ── 4. Merge night rota + day rota ──
  const requestedDates = new Set(body.dates || []);
  const merged = {};

  // Start with nights
  Object.entries(nightRota).forEach(([date, slots]) => {
    if (requestedDates.has(date)) merged[date] = { ...slots };
  });

  // Add day slots (Claude), skipping any overwriting of nights or blocked staff
  const nightSlotKeys = new Set(["N1","N2","SN","AN"]);
  Object.entries(dayRota).forEach(([date, slots]) => {
    if (!requestedDates.has(date)) return;
    if (!merged[date]) merged[date] = {};
    Object.entries(slots).forEach(([slotKey, init]) => {
      if (!init) return;
      if (nightSlotKeys.has(slotKey)) return; // nights already assigned
      // Don't assign someone who's on nights today or in post-night rest
      const av = (body.availability[init] || {});
      if (av.blocked?.includes(date)) return;
      const onNights = Object.values(merged[date] || {}).includes(init) &&
        Object.keys(merged[date] || {}).some(s => nightSlotKeys.has(s));
      if (onNights) return;
      if (postNightBlocked[init]?.has(date)) return;
      merged[date][slotKey] = init;
    });
  });

  // ── 5. Validate ──
  const conflicts = validateRota(merged, body);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ rota: merged, conflicts }),
  };
};

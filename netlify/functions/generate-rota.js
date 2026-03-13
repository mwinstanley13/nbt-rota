// RotaHST AI Rota Generator — Netlify Serverless Function
// Proxies calls to the Anthropic Claude API so the API key stays server-side.
// Set ANTHROPIC_API_KEY in Netlify dashboard → Site → Environment variables.

// ── Helpers ──────────────────────────────────────────────────────────────────

function shiftStartMinutes(dateStr, slotTimes) {
  // Returns absolute minutes since epoch-start-of-day for scheduling
  if (!slotTimes) return null;
  const [h, m] = slotTimes.start.split(":").map(Number);
  return h * 60 + m;
}

function shiftEndMinutes(slotTimes) {
  if (!slotTimes) return null;
  const [h, m] = slotTimes.end.split(":").map(Number);
  return h * 60 + m;
}

function shiftDurationHours(slotTimes) {
  if (!slotTimes) return 0;
  const [sh, sm] = slotTimes.start.split(":").map(Number);
  const [eh, em] = slotTimes.end.split(":").map(Number);
  let hrs = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (hrs <= 0) hrs += 24;
  return hrs;
}

// Returns ISO date string offset by N days
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayName(dateStr) {
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(dateStr).getDay()];
}

function isNightSlot(slotKey) {
  return ["N1","N2","SN","AN"].includes(slotKey);
}

// ── Build prompt ─────────────────────────────────────────────────────────────

function buildPrompt(body) {
  const { dates, slots, staff, availability, targets, contractRules, shiftTimes, minStaffing, slotFilter } = body;

  // Slot grade requirements table
  const slotLines = Object.entries(slots)
    .map(([sk, grades]) => `  ${sk.padEnd(4)}: ${grades.join(", ")}`)
    .join("\n");

  // Staff + availability lines (compact)
  const staffLines = staff.map(s => {
    const av = availability[s.init] || {};
    const parts = [`${s.init} (${s.grade}${s.nightBlockPref && s.nightBlockPref !== "any" ? ", " + s.nightBlockPref + "-nights" : ""})`];
    if (av.blocked?.length)   parts.push(`blocked: ${av.blocked.join(",")}`);
    if (av.earlyOnly?.length) parts.push(`early-only: ${av.earlyOnly.join(",")}`);
    if (av.midOnly?.length)   parts.push(`mid-only: ${av.midOnly.join(",")}`);
    if (av.lateOnly?.length)  parts.push(`late-only: ${av.lateOnly.join(",")}`);
    if (av.nightOnly?.length) parts.push(`night-only: ${av.nightOnly.join(",")}`);
    return parts.join(" | ");
  }).join("\n");

  // Targets lines
  const targetLines = staff.map(s => {
    const t = targets[s.init] || {};
    return `  ${s.init}: nights≤${t.nights||0} weekends≤${t.weekends||0} earlies≤${t.earlies||0} mids≤${t.mids||0} lates≤${t.lates||0}`;
  }).join("\n");

  // Minimum staffing summary
  const minLines = Object.entries(minStaffing || {})
    .map(([day, slts]) => `  ${day}: ${slts.join(", ")}`)
    .join("\n");

  // Date range summary
  const dateRange = dates.length > 0 ? `${dates[0]} to ${dates[dates.length-1]} (${dates.length} days)` : "none";

  // Slot filter note
  const filterNote = slotFilter === "nights"
    ? "Only fill night slots (N1, N2, SN, AN)."
    : slotFilter === "weekends"
    ? "Only fill weekend slots (WE1, WE2, WE3, WL1, WL2, N1, N2, SN, AN on Fri/Sat/Sun)."
    : "Fill all available slots.";

  return `You are an NHS Emergency Department rota scheduling assistant.
Generate a fair, legally-compliant shift rota for ${dateRange}.

${filterNote}

═══ JUNIOR DOCTORS CONTRACT — HARD RULES (never break) ═══
1. Max shift length: ${contractRules.maxShiftHours || 13} hours
2. Min rest between shifts: ${contractRules.minRestHours || 11} hours
3. Max consecutive night shifts: ${contractRules.maxConsecNights || 4}
4. After a run of nights: min ${contractRules.postNightRestHours || 46} hours continuous rest before next shift
5. Max consecutive long day shifts (>10 hrs): ${contractRules.maxConsecLongDays || 5}
6. Max consecutive working days (any type): ${contractRules.maxConsecWorkingDays || 7}
7. Min 48 hours continuous rest every 14 days
8. Weekend frequency: target 1 in 3; max 1 in 2; max ${contractRules.maxConsecWeekends || 4} consecutive weekends
9. Each person can work ONE slot per day only

═══ MINIMUM DAILY STAFFING (fill these first if staff available) ═══
${minLines}

═══ NIGHT SHIFT PATTERNS ═══
- Weekday nights (Mon–Thu): assign the same person for a block of 4 consecutive nights,
  OR split into 2+2 (e.g. Mon–Tue then Thu–Fri) — respect each doctor's preference where possible
- Weekend nights: same person covers Fri, Sat, and Sun nights
- After finishing a night block, that person needs ${contractRules.postNightRestHours || 46}hrs off

═══ SLOT GRADE REQUIREMENTS ═══
${slotLines}

═══ WEEKDAY SLOT TYPES ═══
Early (0800-1630): E1 E2 E3 E4
Mid (1100-2000): M1 M2 M3
Late (1600-0000): L1 L2 L3 L4
Night (2200-0830): N1(ST4+ only) N2(ST4+ only) SN(ST3 only) AN(ACP/tACP only)

═══ WEEKEND SLOT TYPES ═══
W/E Early (0800-1800): WE1 WE2 WE3
W/E Late (1400-0000): WL1 WL2
Night (2200-0830): N1 N2 SN AN

═══ STAFF + AVAILABILITY ═══
${staffLines}

═══ QUARTERLY TARGETS ═══
${targetLines}

═══ SOFT RULES (balance fairly) ═══
- Distribute nights evenly toward each person's target
- Distribute weekends evenly toward each person's target
- Avoid giving someone the same shift type more than 3 days in a row
- When choosing between equally-valid staff for a slot, prefer the one with fewer
  nights/weekends worked so far in this period

═══ OUTPUT FORMAT ═══
Return ONLY a valid JSON object. No explanation, no markdown, no code blocks.
Format: {"2026-08-05":{"E1":"MC","L1":"SJ","N1":"NW"},"2026-08-06":{...}}

Rules for output:
- Only include slots that have a valid assigned person
- Omit slots you cannot fill (do NOT use null, empty string, or invented initials)
- Only use initials exactly as listed in the STAFF section
- Only assign staff to slots their grade is permitted for
- Never assign a blocked person
- Weekends use WE/WL slots, not E/M/L slots
`;
}

// ── Validate rota returned by AI ──────────────────────────────────────────────

function validateRota(rota, body) {
  const { dates, slots, staff, availability, shiftTimes, contractRules } = body;
  const conflicts = [];
  const staffMap = Object.fromEntries(staff.map(s => [s.init, s]));

  // Per-person assignment list for consecutive checks
  const personDates = {}; // init → [{date, slotKey, isNight, isLong, isWeekend}]
  staff.forEach(s => { personDates[s.init] = []; });

  Object.entries(rota).forEach(([date, daySlots]) => {
    const seenToday = {}; // init → slotKey (one shift per day)
    Object.entries(daySlots).forEach(([slotKey, init]) => {
      if (!init) return;
      const person = staffMap[init];
      if (!person) {
        conflicts.push({ date, slot: slotKey, init, rule: "Unknown initials — not in staff list", severity: "error" });
        return;
      }
      // Grade check
      const allowedGrades = slots[slotKey];
      if (allowedGrades && !allowedGrades.includes(person.grade)) {
        conflicts.push({ date, slot: slotKey, init, rule: `Grade ${person.grade} not permitted for ${slotKey} (allowed: ${allowedGrades.join(", ")})`, severity: "error" });
      }
      // Blocked check
      const av = availability[init] || {};
      if (av.blocked?.includes(date)) {
        conflicts.push({ date, slot: slotKey, init, rule: `${init} is blocked on ${date} (SL/Military/PHEM/Unavailable)`, severity: "error" });
      }
      // Preference check
      const dow = new Date(date).getDay(); // 0=Sun,6=Sat
      const isWeekendDay = dow === 0 || dow === 6;
      const isEarlySlot = ["E1","E2","E3","E4","WE1","WE2","WE3"].includes(slotKey);
      const isMidSlot   = ["M1","M2","M3"].includes(slotKey);
      const isLateSlot  = ["L1","L2","L3","L4","WL1","WL2"].includes(slotKey);
      const isNight     = isNightSlot(slotKey);
      if (av.earlyOnly?.includes(date) && !isEarlySlot && !isNight)
        conflicts.push({ date, slot: slotKey, init, rule: `${init} marked Early-only on ${date}`, severity: "warning" });
      if (av.nightOnly?.includes(date) && !isNight)
        conflicts.push({ date, slot: slotKey, init, rule: `${init} marked Night-only on ${date}`, severity: "warning" });
      // One shift per day
      if (seenToday[init]) {
        conflicts.push({ date, slot: slotKey, init, rule: `${init} assigned twice on ${date} (${seenToday[init]} and ${slotKey})`, severity: "error" });
      }
      seenToday[init] = slotKey;
      // Track for consecutive checks
      const times = shiftTimes?.[slotKey];
      const dur = times ? shiftDurationHours(times) : 0;
      if (personDates[init]) {
        personDates[init].push({ date, slotKey, isNight, isLong: dur > 10, isWeekend: isWeekendDay });
      }
    });
  });

  // Consecutive night check
  const maxNights = contractRules?.maxConsecNights || 4;
  Object.entries(personDates).forEach(([init, assignments]) => {
    const sorted = assignments.sort((a, b) => a.date.localeCompare(b.date));
    let consecNights = 0;
    let lastNightDate = null;
    sorted.forEach(a => {
      if (a.isNight) {
        const prev = lastNightDate ? new Date(a.date) - new Date(lastNightDate) : null;
        if (prev && prev === 86400000) {
          consecNights++;
        } else {
          consecNights = 1;
        }
        lastNightDate = a.date;
        if (consecNights > maxNights) {
          conflicts.push({ date: a.date, slot: a.slotKey, init, rule: `${init} has more than ${maxNights} consecutive nights`, severity: "error" });
        }
      } else {
        // Check post-night rest: if previous was a night and gap < postNightRestHours
        if (lastNightDate && consecNights > 0) {
          const gapHours = (new Date(a.date) - new Date(lastNightDate)) / 3600000;
          const required = contractRules?.postNightRestHours || 46;
          if (gapHours < required) {
            conflicts.push({ date: a.date, slot: a.slotKey, init, rule: `${init} has only ${Math.round(gapHours)}hrs rest after nights (need ${required}hrs)`, severity: "error" });
          }
        }
        if (!a.isNight) { consecNights = 0; lastNightDate = null; }
      }
    });
  });

  return conflicts;
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function(event) {
  // CORS preflight
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

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured on server. Set it in Netlify dashboard → Environment variables." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const prompt = buildPrompt(body);

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
        model: "claude-3-haiku-20240307",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: `Failed to reach Claude API: ${e.message}` }),
    };
  }

  const claudeData = await claudeRes.json();

  if (!claudeRes.ok) {
    return {
      statusCode: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: `Claude API error: ${claudeData.error?.message || JSON.stringify(claudeData)}`,
        debug: {
          httpStatus: claudeRes.status,
          errorType: claudeData.error?.type,
          fullError: claudeData,
          keyPrefix: apiKey ? apiKey.slice(0, 10) + "..." : "NOT SET",
        }
      }),
    };
  }

  const text = claudeData.content?.[0]?.text || "";

  // Extract JSON from response (Claude may wrap it in markdown or add text)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      statusCode: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Claude returned an unexpected format — no JSON found.", raw: text.slice(0, 800) }),
    };
  }

  let rota;
  try {
    rota = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to parse Claude response as JSON.", raw: text.slice(0, 800) }),
    };
  }

  // Filter to only requested dates
  const requestedDates = new Set(body.dates || []);
  const filteredRota = {};
  Object.entries(rota).forEach(([date, slots]) => {
    if (requestedDates.has(date)) filteredRota[date] = slots;
  });

  // Validate
  const conflicts = validateRota(filteredRota, body);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ rota: filteredRota, conflicts }),
  };
};

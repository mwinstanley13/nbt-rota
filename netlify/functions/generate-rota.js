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
// Short date format MM-DD to save tokens
const short = d => d.slice(5); // "2026-08-05" → "08-05"

function buildPrompt(body) {
  const { dates, slots, staff, availability, targets, contractRules, minStaffing, slotFilter } = body;

  // Compact grade requirements — group identical-grade sets
  const gradeMap = {};
  Object.entries(slots).forEach(([sk, grades]) => {
    const key = grades.sort().join(",");
    if (!gradeMap[key]) gradeMap[key] = [];
    gradeMap[key].push(sk);
  });
  const slotLines = Object.entries(gradeMap)
    .map(([grades, sks]) => `${sks.join(" ")}: ${grades}`)
    .join("\n");

  // Min staffing compact
  const minLines = Object.entries(minStaffing || {})
    .map(([day, slts]) => `${day}:${slts.join(",")}`)
    .join(" | ");

  // Staff lines — only include availability entries within the date range
  const dateSet = new Set(dates);
  const staffLines = staff.map(s => {
    const av = availability[s.init] || {};
    const parts = [`${s.init}(${s.grade}${s.nightBlockPref && s.nightBlockPref !== "any" ? ","+s.nightBlockPref[0]+"n" : ""})`];
    const inRange = arr => (arr||[]).filter(d => dateSet.has(d)).map(short);
    const bl = inRange(av.blocked);
    const ea = inRange(av.earlyOnly);
    const ni = inRange(av.nightOnly);
    const la = inRange(av.lateOnly);
    const mi = inRange(av.midOnly);
    if (bl.length) parts.push(`X:${bl.join(",")}`);
    if (ea.length) parts.push(`E:${ea.join(",")}`);
    if (ni.length) parts.push(`N:${ni.join(",")}`);
    if (la.length) parts.push(`L:${la.join(",")}`);
    if (mi.length) parts.push(`M:${mi.join(",")}`);
    return parts.join("|");
  }).join("\n");

  // Targets compact
  const targetLines = staff.map(s => {
    const t = targets[s.init] || {};
    return `${s.init}:n${t.nights||0}w${t.weekends||0}e${t.earlies||0}m${t.mids||0}l${t.lates||0}`;
  }).join(" ");

  const dateRange = dates.length > 0 ? `${dates[0]} to ${dates[dates.length-1]} (${dates.length}d)` : "none";
  const filterNote = slotFilter==="nights" ? "Fill ONLY night slots N1 N2 SN AN."
    : slotFilter==="weekends" ? "Fill ONLY weekend+night slots."
    : "Fill all slots.";

  const cr = contractRules || {};

  return `NHS ED rota scheduler. Generate rota for ${dateRange}. ${filterNote}

HARD RULES: max shift ${cr.maxShiftHours||13}h | min rest ${cr.minRestHours||11}h | max ${cr.maxConsecNights||4} consec nights | ${cr.postNightRestHours||46}h rest after nights | max ${cr.maxConsecWorkingDays||7} consec days | weekends max 1in2 target 1in3 | 1 slot per person per day

MIN STAFFING: ${minLines}
NIGHT PATTERN: Weekday nights same person Mon-Thu block or 2+2 split. Weekend same person Fri-Sat-Sun.

SLOT GRADES:
${slotLines}
Weekday slots: E1-E4(early 08-16:30) M1-M3(mid 11-20) L1-L4(late 16-00) N1 N2(ST4+ 22-08:30) SN(ST3) AN(ACP/tACP)
Weekend slots: WE1-WE3(08-18) WL1-WL2(14-00) N1 N2 SN AN

STAFF (format: INIT(grade)|X:blocked|E:earlyOnly|N:nightOnly|L:lateOnly):
${staffLines}

TARGETS (n=nights w=weekends e=earlies m=mids l=lates):
${targetLines}

SOFT: balance nights/weekends toward targets; avoid >3 same type consecutive; prefer lowest-count staff.

Return ONLY JSON, no text. Format: {"2026-08-05":{"E1":"MC","N1":"NW"},...}
Omit unfillable slots. Use exact initials. Weekends use WE/WL not E/M/L.`;
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
        model: "claude-haiku-4-5",
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

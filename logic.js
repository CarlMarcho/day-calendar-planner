export const DAY_MS = 86_400_000;
export const FLAGS = Object.freeze(["ukNight", "ukWork", "schengen"]);
export const PLANNER_TEXT_MAX = 12;

export function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function toDayNumber(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error(`Invalid date: ${dateKey}`);
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function fromDayNumber(dayNumber) {
  if (!Number.isInteger(dayNumber)) throw new Error("Day number must be an integer");
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(dateKey, amount) {
  if (!Number.isInteger(amount)) throw new Error("Day amount must be an integer");
  return fromDayNumber(toDayNumber(dateKey) + amount);
}

export function inclusiveDayCount(start, end) {
  const first = toDayNumber(start);
  const last = toDayNumber(end);
  if (last < first) throw new Error("End date cannot be before start date");
  return last - first + 1;
}

export function dateRange(start, end) {
  const first = toDayNumber(start);
  const last = toDayNumber(end);
  if (last < first) throw new Error("End date cannot be before start date");
  const dates = [];
  for (let day = first; day <= last; day += 1) dates.push(fromDayNumber(day));
  return dates;
}

export function getTaxYear(asOf) {
  const [year] = asOf.split("-").map(Number);
  const aprilSix = `${year}-04-06`;
  const startYear = toDayNumber(asOf) >= toDayNumber(aprilSix) ? year : year - 1;
  return {
    start: `${startYear}-04-06`,
    end: `${startYear + 1}-04-05`,
    label: `6 Apr ${startYear} – 5 Apr ${startYear + 1}`,
  };
}

export function getRollingWindow(asOf, windowDays = 180) {
  if (!Number.isInteger(windowDays) || windowDays < 1) {
    throw new Error("Window must be a positive whole number");
  }
  return {
    start: addDays(asOf, -(windowDays - 1)),
    end: asOf,
    days: windowDays,
  };
}

export function firstOfMonth(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error("Invalid date");
  return `${dateKey.slice(0, 7)}-01`;
}

export function addMonths(monthKey, amount) {
  if (!isValidDateKey(monthKey) || !Number.isInteger(amount)) {
    throw new Error("Invalid month or amount");
  }
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return date.toISOString().slice(0, 10);
}

export function monthGridDates(monthKey) {
  const first = firstOfMonth(monthKey);
  const [year, month] = first.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const gridStart = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function emptyRecord() {
  return { ukNight: false, ukWork: false, schengen: false, plannerText: "", note: "" };
}

export function normalizeRecord(record) {
  const value = record && typeof record === "object" ? record : {};
  return {
    ukNight: value.ukNight === true,
    ukWork: value.ukWork === true,
    schengen: value.schengen === true,
    plannerText: typeof value.plannerText === "string" ? value.plannerText.slice(0, PLANNER_TEXT_MAX) : "",
    note: typeof value.note === "string" ? value.note.slice(0, 500) : "",
  };
}

export function recordHasContent(record) {
  const normalized = normalizeRecord(record);
  return normalized.ukNight || normalized.ukWork || normalized.schengen || normalized.plannerText.trim() !== "" || normalized.note.trim() !== "";
}

export function normalizeDays(days) {
  const normalized = {};
  if (!days || typeof days !== "object" || Array.isArray(days)) return normalized;
  for (const [dateKey, record] of Object.entries(days)) {
    if (!isValidDateKey(dateKey)) continue;
    const clean = normalizeRecord(record);
    if (recordHasContent(clean)) normalized[dateKey] = clean;
  }
  return normalized;
}

export function setFlag(days, dateKey, flag, value) {
  if (!isValidDateKey(dateKey)) throw new Error("Invalid date");
  if (!FLAGS.includes(flag)) throw new Error("Invalid category");
  const next = { ...normalizeDays(days) };
  const record = normalizeRecord(next[dateKey]);
  record[flag] = value === true;
  if (recordHasContent(record)) next[dateKey] = record;
  else delete next[dateKey];
  return next;
}

export function setPlannerText(days, dateKey, plannerText) {
  if (!isValidDateKey(dateKey)) throw new Error("Invalid date");
  const next = { ...normalizeDays(days) };
  const record = normalizeRecord(next[dateKey]);
  record.plannerText = typeof plannerText === "string" ? plannerText.slice(0, PLANNER_TEXT_MAX) : "";
  if (recordHasContent(record)) next[dateKey] = record;
  else delete next[dateKey];
  return next;
}

export function setNote(days, dateKey, note) {
  if (!isValidDateKey(dateKey)) throw new Error("Invalid date");
  const next = { ...normalizeDays(days) };
  const record = normalizeRecord(next[dateKey]);
  record.note = typeof note === "string" ? note.slice(0, 500) : "";
  if (recordHasContent(record)) next[dateKey] = record;
  else delete next[dateKey];
  return next;
}

export function applyRange(days, start, end, flags, value) {
  const requested = Array.from(new Set(flags)).filter((flag) => FLAGS.includes(flag));
  if (!requested.length) throw new Error("Select at least one category");
  const next = { ...normalizeDays(days) };
  for (const dateKey of dateRange(start, end)) {
    const record = normalizeRecord(next[dateKey]);
    for (const flag of requested) record[flag] = value === true;
    if (recordHasContent(record)) next[dateKey] = record;
    else delete next[dateKey];
  }
  return next;
}

export function countFlag(days, flag, start, end) {
  if (!FLAGS.includes(flag)) throw new Error("Invalid category");
  const first = toDayNumber(start);
  const last = toDayNumber(end);
  if (last < first) return 0;
  let count = 0;
  for (let day = first; day <= last; day += 1) {
    if (normalizeRecord(days?.[fromDayNumber(day)])[flag]) count += 1;
  }
  return count;
}

export function calculateCounts(days, asOf, settings = {}) {
  if (!isValidDateKey(asOf)) throw new Error("Invalid as-of date");
  const taxYear = getTaxYear(asOf);
  const rolling = getRollingWindow(asOf, 180);
  const limits = {
    ukNight: positiveInteger(settings.ukNightLimit, 90, 366),
    ukWork: positiveInteger(settings.ukWorkLimit, 30, 366),
    schengen: positiveInteger(settings.schengenLimit, 90, 180),
  };
  const counts = {
    ukNight: countFlag(days, "ukNight", taxYear.start, asOf),
    ukWork: countFlag(days, "ukWork", taxYear.start, asOf),
    schengen: countFlag(days, "schengen", rolling.start, rolling.end),
  };
  return {
    asOf,
    taxYear,
    rolling,
    limits,
    counts,
    status: {
      ukNight: countStatus(counts.ukNight, limits.ukNight),
      ukWork: countStatus(counts.ukWork, limits.ukWork),
      schengen: countStatus(counts.schengen, limits.schengen),
    },
  };
}

export function countStatus(count, limit) {
  const remaining = limit - count;
  return {
    count,
    limit,
    remaining: Math.max(0, remaining),
    atLimit: count === limit,
    overBy: Math.max(0, -remaining),
    exceeded: count > limit,
    near: count >= Math.max(0, limit - 5) && count <= limit,
  };
}

export function summarizeDays(days) {
  const clean = normalizeDays(days);
  const summary = { dates: Object.keys(clean).length, ukNight: 0, ukWork: 0, schengen: 0 };
  for (const record of Object.values(clean)) {
    if (record.ukNight) summary.ukNight += 1;
    if (record.ukWork) summary.ukWork += 1;
    if (record.schengen) summary.schengen += 1;
  }
  return summary;
}

export function mergeDays(baseDays, incomingDays) {
  const result = { ...normalizeDays(baseDays) };
  for (const [dateKey, rawRecord] of Object.entries(normalizeDays(incomingDays))) {
    const base = normalizeRecord(result[dateKey]);
    const incoming = normalizeRecord(rawRecord);
    const notes = [base.note.trim(), incoming.note.trim()].filter(Boolean);
    result[dateKey] = {
      ukNight: base.ukNight || incoming.ukNight,
      ukWork: base.ukWork || incoming.ukWork,
      schengen: base.schengen || incoming.schengen,
      plannerText: base.plannerText.trim() || incoming.plannerText.trim(),
      note: Array.from(new Set(notes)).join(" · ").slice(0, 500),
    };
  }
  return normalizeDays(result);
}

export function importLegacyEntries(entries) {
  if (!Array.isArray(entries)) throw new Error("Backup has no entry list");
  const days = {};
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    if (!isValidDateKey(entry.start) || !isValidDateKey(entry.end)) continue;
    if (toDayNumber(entry.end) < toDayNumber(entry.start)) continue;
    const flag = entry.region === "uk" ? "ukNight" : entry.region === "europe" ? "schengen" : null;
    if (!flag) continue;
    const note = typeof entry.note === "string" ? entry.note.trim().slice(0, 500) : "";
    for (const dateKey of dateRange(entry.start, entry.end)) {
      const record = normalizeRecord(days[dateKey]);
      record[flag] = true;
      if (note) {
        const notes = [record.note.trim(), note].filter(Boolean);
        record.note = Array.from(new Set(notes)).join(" · ").slice(0, 500);
      }
      days[dateKey] = record;
    }
  }
  return normalizeDays(days);
}

export function groupContiguousDates(days, flag) {
  if (!FLAGS.includes(flag)) throw new Error("Invalid category");
  const dates = Object.keys(normalizeDays(days))
    .filter((dateKey) => normalizeRecord(days[dateKey])[flag])
    .sort();
  const ranges = [];
  for (const dateKey of dates) {
    const last = ranges.at(-1);
    if (!last || addDays(last.end, 1) !== dateKey) {
      ranges.push({ start: dateKey, end: dateKey });
    } else {
      last.end = dateKey;
    }
  }
  return ranges;
}

export function createLegacyBackup(days, settings = {}, exportedAt = new Date().toISOString()) {
  const entries = [];
  const categories = [
    ["ukNight", "uk"],
    ["schengen", "europe"],
  ];
  for (const [flag, region] of categories) {
    for (const range of groupContiguousDates(days, flag)) {
      entries.push({
        id: createId(),
        region,
        start: range.start,
        end: range.end,
        note: "",
        createdAt: exportedAt,
      });
    }
  }
  entries.sort((a, b) => a.start.localeCompare(b.start) || a.region.localeCompare(b.region));
  return {
    app: "Residency Day Tracker",
    version: 1,
    exportedAt,
    settings: {
      ukThreshold: positiveInteger(settings.ukNightLimit, 90, 366),
      europeThreshold: positiveInteger(settings.schengenLimit, 90, 180),
    },
    entries,
  };
}

export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function positiveInteger(value, fallback, max) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= max ? number : fallback;
}

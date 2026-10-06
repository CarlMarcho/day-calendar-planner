import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  applyRange,
  calculateCounts,
  createLegacyBackup,
  getRollingWindow,
  getTaxYear,
  groupContiguousDates,
  importLegacyEntries,
  mergeDays,
  monthGridDates,
  normalizeDays,
  normalizeRecord,
  recordHasContent,
  setPlannerText,
  summarizeDays,
} from "../logic.js";

test("date arithmetic remains calendar-safe across leap years", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2024-02-29", 1), "2024-03-01");
  assert.equal(addDays("2025-03-01", -1), "2025-02-28");
});

test("UK tax-year boundary resets on 6 April", () => {
  assert.deepEqual(getTaxYear("2026-04-05"), {
    start: "2025-04-06",
    end: "2026-04-05",
    label: "6 Apr 2025 – 5 Apr 2026",
  });
  assert.deepEqual(getTaxYear("2026-04-06"), {
    start: "2026-04-06",
    end: "2027-04-05",
    label: "6 Apr 2026 – 5 Apr 2027",
  });
});

test("Schengen window is 180 inclusive calendar days", () => {
  assert.deepEqual(getRollingWindow("2026-08-28", 180), {
    start: "2026-03-02",
    end: "2026-08-28",
    days: 180,
  });
});

test("monthly grid starts Monday and always contains 42 dates", () => {
  const dates = monthGridDates("2026-08-01");
  assert.equal(dates.length, 42);
  assert.equal(dates[0], "2026-07-27");
  assert.equal(dates.at(-1), "2026-09-06");
});

test("the three designations can overlap and count independently", () => {
  const days = {
    "2026-03-01": { schengen: true },
    "2026-03-02": { schengen: true },
    "2026-04-06": { ukNight: true, ukWork: true },
    "2026-04-07": { ukWork: true },
    "2026-08-28": { ukNight: true, ukWork: true, schengen: true },
  };
  const result = calculateCounts(days, "2026-08-28", {
    ukNightLimit: 90,
    ukWorkLimit: 30,
    schengenLimit: 90,
  });
  assert.deepEqual(result.counts, { ukNight: 2, ukWork: 3, schengen: 2 });
});

test("future-date calculations include future plans and drop old Schengen days", () => {
  const days = {
    "2026-03-02": { schengen: true },
    "2026-08-28": { schengen: true },
    "2026-08-29": { schengen: true },
  };
  assert.equal(calculateCounts(days, "2026-08-28").counts.schengen, 2);
  assert.equal(calculateCounts(days, "2026-08-29").counts.schengen, 2);
});

test("range edits affect only selected categories", () => {
  let days = applyRange({}, "2026-07-01", "2026-07-03", ["ukNight", "ukWork", "schengen"], true);
  days = applyRange(days, "2026-07-02", "2026-07-02", ["ukWork"], false);
  assert.equal(days["2026-07-02"].ukNight, true);
  assert.equal(days["2026-07-02"].ukWork, false);
  assert.equal(days["2026-07-02"].schengen, true);
  assert.deepEqual(summarizeDays(days), { dates: 3, ukNight: 3, ukWork: 2, schengen: 3 });
});

test("legacy iPhone ranges import as per-day UK-night and Schengen flags", () => {
  const days = importLegacyEntries([
    { region: "uk", start: "2026-08-01", end: "2026-08-03", note: "London" },
    { region: "uk", start: "2026-08-02", end: "2026-08-04", note: "" },
    { region: "europe", start: "2026-08-03", end: "2026-08-05", note: "Verbier" },
  ]);
  assert.deepEqual(summarizeDays(days), { dates: 5, ukNight: 4, ukWork: 0, schengen: 3 });
  assert.equal(days["2026-08-03"].ukNight, true);
  assert.equal(days["2026-08-03"].schengen, true);
  assert.match(days["2026-08-03"].note, /London/);
  assert.match(days["2026-08-03"].note, /Verbier/);
});

test("safe merge uses OR semantics and preserves existing UK workdays", () => {
  const existing = {
    "2026-08-03": { ukWork: true, note: "Meeting" },
  };
  const incoming = {
    "2026-08-03": { ukNight: true, schengen: true, note: "Travel" },
  };
  const merged = mergeDays(existing, incoming);
  assert.equal(merged["2026-08-03"].ukNight, true);
  assert.equal(merged["2026-08-03"].ukWork, true);
  assert.equal(merged["2026-08-03"].schengen, true);
  assert.match(merged["2026-08-03"].note, /Meeting/);
  assert.match(merged["2026-08-03"].note, /Travel/);
});

test("iPhone export groups contiguous dates into ranges", () => {
  const days = normalizeDays({
    "2026-08-01": { ukNight: true },
    "2026-08-02": { ukNight: true },
    "2026-08-04": { ukNight: true },
    "2026-08-02": { ukNight: true, schengen: true },
    "2026-08-03": { schengen: true },
  });
  assert.deepEqual(groupContiguousDates(days, "ukNight"), [
    { start: "2026-08-01", end: "2026-08-02" },
    { start: "2026-08-04", end: "2026-08-04" },
  ]);
  const backup = createLegacyBackup(days, { ukNightLimit: 88, schengenLimit: 90 }, "2026-08-05T00:00:00.000Z");
  assert.equal(backup.settings.ukThreshold, 88);
  assert.equal(backup.entries.filter((entry) => entry.region === "uk").length, 2);
  assert.equal(backup.entries.filter((entry) => entry.region === "europe").length, 1);
});


test("planner labels are limited to 12 characters and count as date content", () => {
  const record = normalizeRecord({ plannerText: "Switzerland!!" });
  assert.equal(record.plannerText, "Switzerland!");
  assert.equal(recordHasContent(record), true);
});

test("planner labels never affect any running count", () => {
  const days = {
    "2026-08-28": { plannerText: "Dubai" },
    "2026-08-29": { ukNight: true, ukWork: true, schengen: true, plannerText: "Italy" },
  };
  assert.deepEqual(calculateCounts(days, "2026-08-29").counts, { ukNight: 1, ukWork: 1, schengen: 1 });
});

test("setting and clearing a planner label preserves independent flags", () => {
  let days = { "2026-08-28": { ukNight: true } };
  days = setPlannerText(days, "2026-08-28", "Dubai");
  assert.equal(days["2026-08-28"].plannerText, "Dubai");
  days = setPlannerText(days, "2026-08-28", "");
  assert.equal(days["2026-08-28"].ukNight, true);
  assert.equal(days["2026-08-28"].plannerText, "");
});

test("safe merge keeps an existing planner label and fills an empty one", () => {
  const merged = mergeDays(
    {
      "2026-08-28": { plannerText: "Dubai" },
      "2026-08-29": { ukWork: true },
    },
    {
      "2026-08-28": { plannerText: "Italy", schengen: true },
      "2026-08-29": { plannerText: "London", ukNight: true },
    },
  );
  assert.equal(merged["2026-08-28"].plannerText, "Dubai");
  assert.equal(merged["2026-08-29"].plannerText, "London");
  assert.equal(merged["2026-08-29"].ukWork, true);
  assert.equal(merged["2026-08-29"].ukNight, true);
});

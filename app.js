import {
  FLAGS,
  PLANNER_TEXT_MAX,
  addDays,
  addMonths,
  applyRange,
  calculateCounts,
  createLegacyBackup,
  firstOfMonth,
  importLegacyEntries,
  isValidDateKey,
  mergeDays,
  monthGridDates,
  normalizeDays,
  normalizeRecord,
  recordHasContent,
  summarizeDays,
  toDayNumber,
} from "./logic.js";

const STORAGE_KEY = "day-calendar-planner-v1";
const DEFAULT_STATE = Object.freeze({
  version: 1,
  settings: { ukNightLimit: 90, ukWorkLimit: 30, schengenLimit: 90 },
  days: {},
});

let state = loadState();
let today = deviceDateKey();
let lastDeviceDate = today;
let selectedDate = today;
let selectedFollowsToday = true;
let viewMonth = firstOfMonth(today);
let undoStack = [];
let pendingImport = null;
let deferredInstallPrompt = null;
let dateRolloverTimer = null;
let toastTimer = null;
let plannerTextEditSnapshot = null;

const elements = {
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  previousMonth: document.querySelector("#previousMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  todayButton: document.querySelector("#todayButton"),
  jumpDate: document.querySelector("#jumpDate"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  projectionBadge: document.querySelector("#projectionBadge"),
  selectedNightCount: document.querySelector("#selectedNightCount"),
  selectedNightLimit: document.querySelector("#selectedNightLimit"),
  selectedWorkCount: document.querySelector("#selectedWorkCount"),
  selectedWorkLimit: document.querySelector("#selectedWorkLimit"),
  selectedSchengenCount: document.querySelector("#selectedSchengenCount"),
  selectedSchengenLimit: document.querySelector("#selectedSchengenLimit"),
  selectedTaxYear: document.querySelector("#selectedTaxYear"),
  selectedRollingWindow: document.querySelector("#selectedRollingWindow"),
  undoButton: document.querySelector("#undoButton"),
  rangeButton: document.querySelector("#rangeButton"),
  rangeDialog: document.querySelector("#rangeDialog"),
  rangeForm: document.querySelector("#rangeForm"),
  rangeStart: document.querySelector("#rangeStart"),
  rangeEnd: document.querySelector("#rangeEnd"),
  rangeMessage: document.querySelector("#rangeMessage"),
  dayDialog: document.querySelector("#dayDialog"),
  dayForm: document.querySelector("#dayForm"),
  dayDialogTitle: document.querySelector("#dayDialogTitle"),
  dayNight: document.querySelector("#dayNight"),
  dayWork: document.querySelector("#dayWork"),
  daySchengen: document.querySelector("#daySchengen"),
  dayPlannerText: document.querySelector("#dayPlannerText"),
  dayNote: document.querySelector("#dayNote"),
  dayDialogCounts: document.querySelector("#dayDialogCounts"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  nightLimit: document.querySelector("#nightLimit"),
  workLimit: document.querySelector("#workLimit"),
  schengenLimit: document.querySelector("#schengenLimit"),
  exportBackup: document.querySelector("#exportBackup"),
  exportCsv: document.querySelector("#exportCsv"),
  exportIphone: document.querySelector("#exportIphone"),
  importBackup: document.querySelector("#importBackup"),
  resetData: document.querySelector("#resetData"),
  importDialog: document.querySelector("#importDialog"),
  importTitle: document.querySelector("#importTitle"),
  importCopy: document.querySelector("#importCopy"),
  importStats: document.querySelector("#importStats"),
  mergeImport: document.querySelector("#mergeImport"),
  replaceImport: document.querySelector("#replaceImport"),
  printButton: document.querySelector("#printButton"),
  installButton: document.querySelector("#installButton"),
  toast: document.querySelector("#toast"),
};

initialize();

function initialize() {
  bindEvents();
  render();
  scheduleDateRolloverCheck();
  registerServiceWorker();
}

function bindEvents() {
  elements.previousMonth.addEventListener("click", () => shiftMonth(-1));
  elements.nextMonth.addEventListener("click", () => shiftMonth(1));
  elements.todayButton.addEventListener("click", goToToday);
  elements.jumpDate.addEventListener("change", () => {
    const dateKey = elements.jumpDate.value;
    if (!isValidDateKey(dateKey)) return;
    selectedDate = dateKey;
    selectedFollowsToday = dateKey === today;
    viewMonth = firstOfMonth(dateKey);
    render();
  });

  elements.calendarGrid.addEventListener("change", handleCalendarChange);
  elements.calendarGrid.addEventListener("click", handleCalendarClick);
  elements.calendarGrid.addEventListener("focusin", beginPlannerTextEdit);
  elements.calendarGrid.addEventListener("input", updatePlannerText);
  elements.calendarGrid.addEventListener("focusout", finishPlannerTextEdit);
  elements.calendarGrid.addEventListener("keydown", handlePlannerTextKeydown);
  elements.undoButton.addEventListener("click", undoLastChange);

  elements.rangeButton.addEventListener("click", openRangeDialog);
  elements.rangeForm.addEventListener("submit", applyRangeForm);
  elements.rangeStart.addEventListener("change", () => {
    if (!elements.rangeEnd.value || elements.rangeEnd.value < elements.rangeStart.value) {
      elements.rangeEnd.value = elements.rangeStart.value;
    }
  });

  elements.dayForm.addEventListener("submit", saveDayDialog);
  [elements.dayNight, elements.dayWork, elements.daySchengen].forEach((input) => {
    input.addEventListener("change", renderDayDialogCounts);
  });

  elements.settingsButton.addEventListener("click", openSettings);
  elements.settingsForm.addEventListener("submit", saveSettings);
  elements.exportBackup.addEventListener("click", exportBackup);
  elements.exportCsv.addEventListener("click", exportCsv);
  elements.exportIphone.addEventListener("click", exportForIphone);
  elements.importBackup.addEventListener("change", prepareImport);
  elements.resetData.addEventListener("click", resetData);
  elements.mergeImport.addEventListener("click", () => completeImport("merge"));
  elements.replaceImport.addEventListener("click", () => completeImport("replace"));
  elements.printButton.addEventListener("click", () => window.print());

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`)?.close());
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.classList.remove("hidden");
  });
  elements.installButton.addEventListener("click", installApp);
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installButton.classList.add("hidden");
    showToast("Day Calendar installed.");
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncToDeviceDate();
  });
  window.addEventListener("focus", syncToDeviceDate);
  window.addEventListener("pageshow", syncToDeviceDate);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      settings: normalizeSettings(parsed.settings),
      days: normalizeDays(parsed.days),
    };
  } catch (error) {
    console.error("Could not load calendar data", error);
    return clone(DEFAULT_STATE);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  elements.calendarTitle.textContent = formatMonth(viewMonth);
  elements.jumpDate.value = selectedDate;
  renderSelectedSummary();
  renderCalendar();
  renderUndoButton();
}

function renderSelectedSummary() {
  const dashboard = calculateCounts(state.days, selectedDate, state.settings);
  elements.selectedDateLabel.textContent = formatLongDate(selectedDate);
  const future = toDayNumber(selectedDate) > toDayNumber(today);
  elements.projectionBadge.textContent = future ? "Projected" : selectedDate === today ? "Today" : "Recorded";
  elements.projectionBadge.classList.toggle("future", future);

  setSummaryMetric("night", dashboard.status.ukNight);
  setSummaryMetric("work", dashboard.status.ukWork);
  setSummaryMetric("schengen", dashboard.status.schengen);
  elements.selectedTaxYear.textContent = `UK counters: ${dashboard.taxYear.label}`;
  elements.selectedRollingWindow.textContent = `Schengen window: ${formatShortDate(dashboard.rolling.start)} – ${formatShortDate(dashboard.rolling.end)}`;
}

function setSummaryMetric(category, status) {
  const name = category[0].toUpperCase() + category.slice(1);
  elements[`selected${name}Count`].textContent = status.count.toLocaleString();
  elements[`selected${name}Limit`].textContent = status.limit.toLocaleString();
  const card = elements[`selected${name}Count`].closest(".summary-metric");
  card.classList.toggle("warning", status.near && !status.exceeded);
  card.classList.toggle("exceeded", status.exceeded);
}

function renderCalendar() {
  const dates = monthGridDates(viewMonth);
  const monthPrefix = viewMonth.slice(0, 7);
  const fragment = document.createDocumentFragment();

  for (const dateKey of dates) {
    const record = normalizeRecord(state.days[dateKey]);
    const dashboard = calculateCounts(state.days, dateKey, state.settings);
    const cell = document.createElement("article");
    const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
    const outsideMonth = dateKey.slice(0, 7) !== monthPrefix;
    const future = toDayNumber(dateKey) > toDayNumber(today);
    const hasEntry = recordHasContent(record);

    cell.className = "day-cell";
    cell.dataset.date = dateKey;
    cell.classList.toggle("outside-month", outsideMonth);
    cell.classList.toggle("weekend", weekday === 0 || weekday === 6);
    cell.classList.toggle("today", dateKey === today);
    cell.classList.toggle("selected", dateKey === selectedDate);
    cell.classList.toggle("future", future);
    cell.classList.toggle("has-entry", hasEntry);

    const [year, month, day] = dateKey.split("-").map(Number);
    const monthAbbrev = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, 1)));

    cell.innerHTML = `
      <div class="day-heading">
        <button class="date-button" type="button" data-select-date="${dateKey}" aria-label="Select ${escapeHtml(formatLongDate(dateKey))}">
          <span class="day-number">${day}</span>
          ${outsideMonth ? `<span class="day-month">${escapeHtml(monthAbbrev)}</span>` : ""}
          <span class="today-chip">Today</span>
          <span class="planned-chip">Plan</span>
        </button>
        <button class="details-button" type="button" data-open-date="${dateKey}" aria-label="Open details for ${escapeHtml(formatLongDate(dateKey))}">•••</button>
      </div>
      <input
        class="day-planner-input"
        type="text"
        maxlength="${PLANNER_TEXT_MAX}"
        data-planner-text
        data-date="${dateKey}"
        value="${escapeHtml(record.plannerText)}"
        placeholder="Place / plan"
        aria-label="Planning label for ${escapeHtml(formatLongDate(dateKey))}"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="day-toggles">
        ${calendarToggle(dateKey, "ukNight", "UK night", "night", record.ukNight)}
        ${calendarToggle(dateKey, "ukWork", "UK workday", "work", record.ukWork)}
        ${calendarToggle(dateKey, "schengen", "Schengen", "schengen", record.schengen)}
      </div>
      <div class="running-totals" aria-label="Running totals through ${escapeHtml(formatLongDate(dateKey))}">
        ${runningTotal("N", "UK nights since 6 April", "night", dashboard.status.ukNight)}
        ${runningTotal("W", "UK workdays since 6 April", "work", dashboard.status.ukWork)}
        ${runningTotal("S", "Schengen days in the past 180 days", "schengen", dashboard.status.schengen)}
      </div>
      ${record.note.trim() ? '<span class="note-marker" title="This date has a note"></span>' : ""}
    `;
    fragment.append(cell);
  }

  elements.calendarGrid.replaceChildren(fragment);
}

function calendarToggle(dateKey, flag, label, category, checked) {
  return `
    <label class="day-toggle category-${category}" title="${escapeHtml(label)}: ${checked ? "Yes" : "No"}">
      <span>${escapeHtml(label)}</span>
      <input type="checkbox" data-date="${dateKey}" data-flag="${flag}" ${checked ? "checked" : ""} aria-label="${escapeHtml(label)} on ${escapeHtml(formatLongDate(dateKey))}" />
      <span class="mini-switch" aria-hidden="true"></span>
    </label>
  `;
}

function runningTotal(shortLabel, title, category, status) {
  const classes = ["running-total", `category-${category}`];
  if (status.exceeded) classes.push("exceeded");
  else if (status.near) classes.push("warning");
  return `<span class="${classes.join(" ")}" title="${escapeHtml(title)}: ${status.count} of ${status.limit}"><abbr>${shortLabel}</abbr><strong>${status.count}</strong></span>`;
}

function beginPlannerTextEdit(event) {
  const input = event.target.closest('input[data-planner-text][data-date]');
  if (!input || !isValidDateKey(input.dataset.date)) return;
  const dateKey = input.dataset.date;
  plannerTextEditSnapshot = {
    dateKey,
    value: normalizeRecord(state.days[dateKey]).plannerText,
    days: clone(state.days),
    settings: clone(state.settings),
  };
}

function updatePlannerText(event) {
  const input = event.target.closest('input[data-planner-text][data-date]');
  if (!input) return;
  const dateKey = input.dataset.date;
  if (!isValidDateKey(dateKey)) return;

  const text = input.value.slice(0, PLANNER_TEXT_MAX);
  if (input.value !== text) input.value = text;

  const days = { ...state.days };
  const record = normalizeRecord(days[dateKey]);
  record.plannerText = text;
  if (recordHasContent(record)) days[dateKey] = record;
  else delete days[dateKey];
  state.days = normalizeDays(days);
  persist();

  input.closest('.day-cell')?.classList.toggle('has-entry', recordHasContent(record));
}

function finishPlannerTextEdit(event) {
  const input = event.target.closest('input[data-planner-text][data-date]');
  if (!input || !plannerTextEditSnapshot) return;
  const dateKey = input.dataset.date;
  if (plannerTextEditSnapshot.dateKey !== dateKey) return;

  const currentValue = normalizeRecord(state.days[dateKey]).plannerText;
  if (currentValue !== plannerTextEditSnapshot.value) {
    undoStack.push({
      label: `label for ${formatShortDate(dateKey)}`,
      days: plannerTextEditSnapshot.days,
      settings: plannerTextEditSnapshot.settings,
    });
    if (undoStack.length > 20) undoStack.shift();
    renderUndoButton();
  }
  plannerTextEditSnapshot = null;
}

function handlePlannerTextKeydown(event) {
  const input = event.target.closest('input[data-planner-text][data-date]');
  if (!input) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    input.blur();
  } else if (event.key === 'Escape' && plannerTextEditSnapshot?.dateKey === input.dataset.date) {
    event.preventDefault();
    input.value = plannerTextEditSnapshot.value;
    updatePlannerText({ target: input });
    input.blur();
  }
}

function handleCalendarChange(event) {
  const input = event.target.closest('input[data-date][data-flag]');
  if (!input) return;
  const { date, flag } = input.dataset;
  if (!isValidDateKey(date) || !FLAGS.includes(flag)) return;

  pushUndo(`change to ${formatShortDate(date)}`);
  const days = { ...state.days };
  const record = normalizeRecord(days[date]);
  record[flag] = input.checked;
  if (recordHasContent(record)) days[date] = record;
  else delete days[date];
  state.days = normalizeDays(days);
  selectedDate = date;
  selectedFollowsToday = date === today;
  persist();
  render();
}

function handleCalendarClick(event) {
  const selectButton = event.target.closest("[data-select-date]");
  if (selectButton) {
    const dateKey = selectButton.dataset.selectDate;
    selectedDate = dateKey;
    selectedFollowsToday = dateKey === today;
    if (dateKey.slice(0, 7) !== viewMonth.slice(0, 7)) viewMonth = firstOfMonth(dateKey);
    render();
    return;
  }

  const detailsButton = event.target.closest("[data-open-date]");
  if (detailsButton) openDayDialog(detailsButton.dataset.openDate);
}

function shiftMonth(amount) {
  const nextMonth = addMonths(viewMonth, amount);
  const preferredDay = Number(selectedDate.slice(8, 10));
  const [year, month] = nextMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = String(Math.min(preferredDay, lastDay)).padStart(2, "0");
  viewMonth = nextMonth;
  selectedDate = `${nextMonth.slice(0, 7)}-${day}`;
  selectedFollowsToday = selectedDate === today;
  render();
}

function goToToday() {
  today = deviceDateKey();
  selectedDate = today;
  selectedFollowsToday = true;
  viewMonth = firstOfMonth(today);
  render();
}

function openRangeDialog() {
  elements.rangeStart.value = selectedDate;
  elements.rangeEnd.value = selectedDate;
  elements.rangeMessage.textContent = "";
  document.querySelectorAll('input[name="rangeFlag"]').forEach((input) => { input.checked = false; });
  document.querySelector('input[name="rangeValue"][value="yes"]').checked = true;
  elements.rangeDialog.showModal();
}

function applyRangeForm(event) {
  event.preventDefault();
  const start = elements.rangeStart.value;
  const end = elements.rangeEnd.value;
  const flags = [...document.querySelectorAll('input[name="rangeFlag"]:checked')].map((input) => input.value);
  const value = document.querySelector('input[name="rangeValue"]:checked')?.value === "yes";

  if (!isValidDateKey(start) || !isValidDateKey(end)) {
    elements.rangeMessage.textContent = "Choose a valid start and end date.";
    return;
  }
  if (end < start) {
    elements.rangeMessage.textContent = "The end date cannot be before the start date.";
    return;
  }
  if (!flags.length) {
    elements.rangeMessage.textContent = "Select at least one category.";
    return;
  }

  pushUndo(`range ${formatShortDate(start)}–${formatShortDate(end)}`);
  state.days = applyRange(state.days, start, end, flags, value);
  selectedDate = end;
  selectedFollowsToday = end === today;
  viewMonth = firstOfMonth(end);
  persist();
  elements.rangeDialog.close();
  render();
  showToast(`${value ? "Marked" : "Cleared"} ${flags.length} ${flags.length === 1 ? "category" : "categories"} from ${formatShortDate(start)} to ${formatShortDate(end)}.`);
}

function openDayDialog(dateKey) {
  if (!isValidDateKey(dateKey)) return;
  selectedDate = dateKey;
  selectedFollowsToday = dateKey === today;
  const record = normalizeRecord(state.days[dateKey]);
  elements.dayDialogTitle.textContent = formatLongDate(dateKey);
  elements.dayForm.dataset.date = dateKey;
  elements.dayNight.checked = record.ukNight;
  elements.dayWork.checked = record.ukWork;
  elements.daySchengen.checked = record.schengen;
  elements.dayPlannerText.value = record.plannerText;
  elements.dayNote.value = record.note;
  renderDayDialogCounts();
  render();
  elements.dayDialog.showModal();
}

function previewDayDialogDays() {
  const dateKey = elements.dayForm.dataset.date;
  const days = { ...state.days };
  const record = {
    ukNight: elements.dayNight.checked,
    ukWork: elements.dayWork.checked,
    schengen: elements.daySchengen.checked,
    plannerText: elements.dayPlannerText.value.slice(0, PLANNER_TEXT_MAX),
    note: elements.dayNote.value,
  };
  if (recordHasContent(record)) days[dateKey] = record;
  else delete days[dateKey];
  return normalizeDays(days);
}

function renderDayDialogCounts() {
  const dateKey = elements.dayForm.dataset.date;
  if (!isValidDateKey(dateKey)) return;
  const dashboard = calculateCounts(previewDayDialogDays(), dateKey, state.settings);
  elements.dayDialogCounts.innerHTML = `
    <div class="dialog-count category-night"><span>UK nights to date</span><strong>${dashboard.counts.ukNight} / ${dashboard.limits.ukNight}</strong></div>
    <div class="dialog-count category-work"><span>UK workdays to date</span><strong>${dashboard.counts.ukWork} / ${dashboard.limits.ukWork}</strong></div>
    <div class="dialog-count category-schengen"><span>Schengen in 180 days</span><strong>${dashboard.counts.schengen} / ${dashboard.limits.schengen}</strong></div>
  `;
}

function saveDayDialog(event) {
  event.preventDefault();
  const dateKey = elements.dayForm.dataset.date;
  if (!isValidDateKey(dateKey)) return;
  pushUndo(`details for ${formatShortDate(dateKey)}`);
  state.days = previewDayDialogDays();
  persist();
  elements.dayDialog.close();
  render();
  showToast(`Saved ${formatLongDate(dateKey)}.`);
}

function pushUndo(label) {
  undoStack.push({ label, days: clone(state.days), settings: clone(state.settings) });
  if (undoStack.length > 20) undoStack.shift();
}

function renderUndoButton() {
  elements.undoButton.disabled = undoStack.length === 0;
  elements.undoButton.textContent = undoStack.length ? `Undo ${undoStack.at(-1).label}` : "Undo";
}

function undoLastChange() {
  const previous = undoStack.pop();
  if (!previous) return;
  state.days = normalizeDays(previous.days);
  state.settings = normalizeSettings(previous.settings);
  persist();
  render();
  showToast(`Undid ${previous.label}.`);
}

function openSettings() {
  elements.nightLimit.value = state.settings.ukNightLimit;
  elements.workLimit.value = state.settings.ukWorkLimit;
  elements.schengenLimit.value = state.settings.schengenLimit;
  elements.settingsDialog.showModal();
}

function saveSettings(event) {
  event.preventDefault();
  const settings = normalizeSettings({
    ukNightLimit: elements.nightLimit.value,
    ukWorkLimit: elements.workLimit.value,
    schengenLimit: elements.schengenLimit.value,
  });
  pushUndo("settings change");
  state.settings = settings;
  persist();
  elements.settingsDialog.close();
  render();
  showToast("Planning limits saved.");
}

function exportBackup() {
  const payload = {
    app: "Day Calendar Planner",
    version: 1.1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    days: state.days,
  };
  downloadFile(`day-calendar-backup-${deviceDateKey()}.json`, JSON.stringify(payload, null, 2), "application/json");
  showToast("Full calendar backup exported.");
}

function exportCsv() {
  const rows = [[
    "date",
    "uk_night",
    "uk_workday",
    "schengen_day",
    "uk_nights_since_april_6",
    "uk_workdays_since_april_6",
    "schengen_days_trailing_180",
    "calendar_label",
    "note",
  ]];
  for (const dateKey of Object.keys(state.days).sort()) {
    const record = normalizeRecord(state.days[dateKey]);
    const dashboard = calculateCounts(state.days, dateKey, state.settings);
    rows.push([
      dateKey,
      record.ukNight ? "Yes" : "No",
      record.ukWork ? "Yes" : "No",
      record.schengen ? "Yes" : "No",
      String(dashboard.counts.ukNight),
      String(dashboard.counts.ukWork),
      String(dashboard.counts.schengen),
      record.plannerText,
      record.note,
    ]);
  }
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  downloadFile(`day-calendar-${deviceDateKey()}.csv`, csv, "text/csv;charset=utf-8");
  showToast("CSV exported.");
}

function exportForIphone() {
  const payload = createLegacyBackup(state.days, state.settings);
  downloadFile(`residency-day-tracker-backup-${deviceDateKey()}.json`, JSON.stringify(payload, null, 2), "application/json");
  showToast("iPhone-compatible backup exported. UK workdays are not included.");
}

async function prepareImport(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    let days;
    let settings;
    let source;

    if (parsed && typeof parsed === "object" && parsed.days && !Array.isArray(parsed.days)) {
      days = normalizeDays(parsed.days);
      settings = normalizeSettings(parsed.settings);
      source = "Day Calendar backup";
    } else if (Array.isArray(parsed?.entries)) {
      days = importLegacyEntries(parsed.entries);
      settings = normalizeSettings({
        ukNightLimit: parsed.settings?.ukThreshold,
        ukWorkLimit: state.settings.ukWorkLimit,
        schengenLimit: parsed.settings?.europeThreshold,
      });
      source = "iPhone Day Tracker backup";
    } else {
      throw new Error("This is not a recognised Day Calendar or iPhone Day Tracker backup.");
    }

    pendingImport = { days, settings, source };
    showImportPreview();
    elements.settingsDialog.close();
    elements.importDialog.showModal();
  } catch (error) {
    window.alert(`Could not import that file: ${error.message}`);
  }
}

function showImportPreview() {
  const summary = summarizeDays(pendingImport.days);
  elements.importTitle.textContent = pendingImport.source;
  elements.importCopy.textContent = pendingImport.source === "iPhone Day Tracker backup"
    ? "UK-night entries will become blue UK-night switches, and old Europe entries will be treated as green Schengen switches. Existing UK-workday data is untouched when you choose Merge safely. Review any old Europe dates that you recorded using a broader definition than Schengen."
    : "Review the imported totals, then merge them with this calendar or replace this calendar completely.";
  elements.importStats.innerHTML = [
    ["Dates", summary.dates],
    ["UK nights", summary.ukNight],
    ["UK workdays", summary.ukWork],
    ["Schengen", summary.schengen],
  ].map(([label, value]) => `<div class="import-stat"><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString()}</strong></div>`).join("");
}

function completeImport(mode) {
  if (!pendingImport) return;
  pushUndo(`${mode} import`);
  if (mode === "replace") {
    state.days = normalizeDays(pendingImport.days);
    state.settings = normalizeSettings(pendingImport.settings);
  } else {
    state.days = mergeDays(state.days, pendingImport.days);
  }
  persist();
  const summary = summarizeDays(pendingImport.days);
  pendingImport = null;
  elements.importDialog.close();
  render();
  showToast(`${mode === "replace" ? "Replaced calendar with" : "Merged"} ${summary.dates.toLocaleString()} imported dates.`);
}

function resetData() {
  const confirmed = window.confirm("Delete every marked date, note and setting in this laptop calendar? You can undo this during the current session or restore an exported backup.");
  if (!confirmed) return;
  pushUndo("calendar reset");
  state = clone(DEFAULT_STATE);
  persist();
  elements.settingsDialog.close();
  render();
  showToast("Calendar cleared. Undo is available during this session.");
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installButton.classList.add("hidden");
}

function syncToDeviceDate() {
  const current = deviceDateKey();
  if (current !== lastDeviceDate) {
    const oldToday = lastDeviceDate;
    today = current;
    lastDeviceDate = current;
    if (selectedFollowsToday || selectedDate === oldToday) {
      selectedDate = current;
      selectedFollowsToday = true;
      if (viewMonth.slice(0, 7) === oldToday.slice(0, 7)) viewMonth = firstOfMonth(current);
    }
    render();
  }
  scheduleDateRolloverCheck();
}

function scheduleDateRolloverCheck() {
  if (dateRolloverTimer !== null) window.clearTimeout(dateRolloverTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
  dateRolloverTimer = window.setTimeout(syncToDeviceDate, Math.max(1_000, nextMidnight.getTime() - now.getTime()));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

function normalizeSettings(settings = {}) {
  return {
    ukNightLimit: positiveInt(settings.ukNightLimit, 90, 366),
    ukWorkLimit: positiveInt(settings.ukWorkLimit, 30, 366),
    schengenLimit: positiveInt(settings.schengenLimit, 90, 180),
  };
}

function positiveInt(value, fallback, max) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= max ? number : fallback;
}

function deviceDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonth(dateKey) {
  const [year, month] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatLongDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function formatShortDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3_200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

# Day Calendar Planner

A local-first monthly calendar for planning and recording three independent day designations:

- **UK night** — counted from the most recent 6 April through each calendar date.
- **UK workday** — counted from the most recent 6 April through each calendar date.
- **Schengen day** — counted in the inclusive 180-day window ending on each calendar date.

A single date can carry any combination of the three flags. Past and future dates use the same switches, so the totals displayed inside future calendar boxes are projected totals.

## Main features

- Traditional Monday-to-Sunday monthly calendar.
- Independent on/off switch for each designation in every day box.
- A visible 12-character planning label inside every date, for entries such as `Dubai`, `Italy` or `NYC`.
- Running **N**, **W** and **S** totals inside every day box.
- Live future planning: all later totals recalculate as soon as a planned date changes.
- Bulk fill/clear tool for a date range.
- Configurable warning limits, initially 90 UK nights, 30 UK workdays and 90 Schengen days.
- One-session Undo for switches, range edits, imports, settings and reset.
- Optional longer notes on individual dates, separate from the visible planning label.
- Full JSON backup, CSV export and print view.
- Imports the JSON backup produced by the existing iPhone Residency Day Tracker.
- Exports an iPhone-compatible backup containing UK nights and Schengen days.
- Works offline after its first successful load.
- No account, tracking code, analytics or external JavaScript libraries.

## Publish with GitHub Pages

1. Create a new public GitHub repository, for example `day-calendar-planner`.
2. Upload **the contents of this folder** to the repository. `index.html` must appear at the repository's top level.
3. Open the repository's **Settings**.
4. Select **Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select branch **main** and folder **/ (root)**, then save.
7. Open the GitHub Pages address shown in the Pages settings.

The address will usually be:

`https://YOUR-USERNAME.github.io/day-calendar-planner/`

## Install on a laptop

Open the published address in Chrome or Microsoft Edge. The app should offer an **Install app** button in its header once the browser recognises it as installable. The browser may also show an install icon at the right-hand side of the address bar.

After installation, Day Calendar opens in its own window and remains available from the Start menu or applications list.

## Import existing iPhone dates

1. In the existing iPhone Day Tracker, open **Settings** and choose **Export backup**.
2. Save or transfer the resulting JSON file to the laptop.
3. In Day Calendar, open **Settings → Import backup**.
4. Select the iPhone JSON file.
5. Choose **Merge safely**.

The import converts:

- iPhone **UK** entries to **UK night** switches.
- iPhone **Europe** entries to **Schengen day** switches. The import assumes those older Europe entries were intended to represent Schengen; review any dates recorded under a broader definition.
- Existing laptop **UK workday** entries are preserved by a safe merge.

## Transfer calendar dates back to the iPhone app

Use **Settings → Export for iPhone app**. This creates a backup in the format expected by the existing iPhone tracker.

It includes UK nights and Schengen days. UK workdays, calendar labels and longer notes are not included because the current iPhone app has no matching fields.

The two apps do not automatically synchronise. Data in each browser remains local unless a backup is manually exported and imported.

## Data and backups

The short labels are stored with the rest of each date and included in full JSON backups and CSV exports. They do not affect any UK or Schengen calculations.

Calendar data is stored in browser local storage under:

`day-calendar-planner-v1`

Clearing browser site data, changing the published web address or changing computers can remove access to local data. Export a full JSON backup periodically and save it somewhere durable.

## Calculation definitions

For any calendar date `D`:

- **UK night total:** marked UK nights from the 6 April that begins the UK tax year containing `D`, through and including `D`.
- **UK workday total:** marked UK workdays over the same period.
- **Schengen total:** marked Schengen dates from `D − 179 days` through and including `D`.

The app counts the dates you designate. It does not determine whether a date meets a legal tax or immigration definition.

## Development test

With Node.js installed:

```bash
npm test
```

The included tests cover tax-year boundaries, the inclusive 180-day window, leap dates, overlapping categories, future projections, bulk edits and iPhone backup compatibility.

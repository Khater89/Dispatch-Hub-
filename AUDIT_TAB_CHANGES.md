# Audit Tab — Filtered Statistics Update

## Summary

The Audit Tab (Excel Auditor / Validation Tool at `validation_tool/index.html`) has been updated so that **all displayed statistics, summary cards, charts, and the exported PDF are calculated from the currently filtered dataset only**.

This aligns with the requirement that statistics must always match the visible filtered records — resetting filters restores the original overall statistics, and filters that return zero rows produce a clear empty state.

---

## What Changed

### 1. On-screen dashboard (`renderStats`, `renderCharts`)

- **Single source of truth:** both functions already received `S.filtered` as input, and they have been hardened so every KPI card and every chart is computed from that filtered array only. There is no fallback to `S.raw` on this path.
- **Empty state for cards:** when the filtered result contains zero rows, the stat grid now renders a single full-width empty-state panel (`.empty-audit-state`) with:
  - 🔍 icon + "No records match the current filters" headline
  - A human-readable summary of the active filters (e.g. `Search: "abc" · Status: errors · 2024-04-01 → 2024-04-30`)
  - A **Clear All Filters** button that calls `clearF()` and restores the original global statistics
  - Context line showing "0 of N total" so the user knows the dataset is not actually empty
- **Empty state for charts:** all three charts (`cPie`, `cBar`, `cType`) are destroyed and replaced with a centred "No data for current filters" placeholder drawn directly on the canvas.
- **Filter badge:** when any filter is active, a pulsing "Filtered" pill is shown next to the "Tickets" card header and each card's sub-line now displays `of <N> total` so users can see how much of the dataset is being shown.

### 2. Filter-state helpers (new)

Two small utilities were added next to `applyFilters`:

- `hasActiveFilters()` → `true` if any of search / type / status / specific-date / from-date / to-date differs from its default.
- `activeFilterSummary()` → builds a readable string describing the active filters (used in the empty state and in the PDF).

### 3. Management PDF export (`exportPDF`)

The PDF generator previously computed KPIs from a `datePeriodRows` set that only honoured date filters — status, type, and search were ignored on page 1 and only affected the anomaly table on page 2. That has been removed.

- `filteredRows = S.filtered` is now the single source for all KPI cards, accuracy rate, and the anomaly table. `fullDataset = S.raw` is kept only as a reference figure for the "Filtered X of N" label.
- The executive dashboard cards (`Total Tickets Audited`, `Accuracy Rate`, etc.) all read from `sv = calcStats(filteredRows)`.
- The "Reporting Period" box has been renamed to **Reporting Scope** and shows either `REPORTING SCOPE (FILTERED)` with the full filter summary, or `REPORTING SCOPE (ALL DATA)` when no filter is active. The explanatory text now says that all KPIs, charts, and the anomaly table reflect the filtered ticket count out of the total.
- The anomaly table on page 2 uses `filteredRows` instead of `datePeriodRows`, so the on-screen view and the PDF always agree.
- The PDF header line now reads `Scope: Filtered (X/N)` or `Scope: All Data` instead of the old `Period: …` label.
- The bottom-of-table summary line uses a filtered-vs-all-data caption.
- If the user clicks "Export Management PDF" while the current filter returns zero rows, a `confirm()` dialog warns them that the report will be all zeros and lets them cancel and adjust filters first.

### 4. Reset behaviour

`clearF()` already called `applyFilters()`, which in turn re-renders stats and charts from `S.filtered`. Because `S.filtered` after a reset equals the full dataset, the original overall statistics are restored automatically — no extra code path was needed. The empty-state **Clear All Filters** button reuses the same `clearF()`.

### 5. CSS additions

A single `<style>` block was extended at the top of the file with:

- `.empty-audit-state` (+ icon / title / sub / button classes) for the filtered-empty dashboard state
- `.filter-active-badge` with a pulsing dot indicator
- `.chart-empty-msg` reserved for future use (current implementation draws directly on canvas)

No existing styles were removed or renamed.

---

## Files Modified

- `validation_tool/index.html` — only file changed. All edits are contained in this one HTML file (CSS `<style>` block + the inline `<script>` block starting at line ~405).

No backend, config, or build changes were needed.

---

## Behaviour Matrix

| User action                                | Cards / Charts source       | Empty state?     | PDF export source          |
|--------------------------------------------|-----------------------------|------------------|----------------------------|
| No filters applied                         | `S.filtered` (== `S.raw`)   | No               | `S.filtered` (== `S.raw`)  |
| One or more filters, results > 0           | `S.filtered`                | No; "Filtered" badge shown | `S.filtered`        |
| Filters applied, results == 0              | `S.filtered` (empty)        | Yes — full-width empty panel + Clear button | `S.filtered` (user warned, KPIs = 0) |
| Click **Clear Filters** / `clearF()`       | `S.filtered` (== `S.raw`)   | No               | `S.filtered` (== `S.raw`)  |

---

## Manual Test Checklist

1. Upload an Excel workbook — dashboard should show global stats for all rows.
2. Apply **Status = Errors Only** — cards, progress bar, and all three charts should update to reflect only the error rows; a "Filtered" badge appears on the Tickets card and each card shows `of <N> total`.
3. Add a **From / To date** range — stats update again; the Tickets count must match the tickets count in the toolbar ("X of Y tickets").
4. Set a **Search** term that returns nothing — the stats grid collapses into the empty-state panel with the filter summary; the three charts show a centred "📭 No data for current filters" message; the progress bar resets to 0%.
5. Click **Clear All Filters** (from the empty state or from the toolbar) — original global statistics restored.
6. Click **Export Management PDF** with a filter active:
   - Header says `Scope: Filtered (X/N)`.
   - KPI cards and charts mirror the on-screen filtered values.
   - Reporting Scope box is labelled `REPORTING SCOPE (FILTERED)` with the filter summary.
   - Anomaly table only contains anomalies from the filtered set.
7. Repeat the PDF export with no filters — header says `Scope: All Data`, scope box says `REPORTING SCOPE (ALL DATA)`, and the anomaly table includes anomalies from the entire file.
8. Apply a filter that yields zero rows and try to export — a confirm dialog appears; cancel keeps the filter, OK exports an all-zero PDF.

---

## How to Commit / Publish to GitHub

From the project root:

```bash
git checkout -b audit-tab-filtered-stats
git add validation_tool/index.html AUDIT_TAB_CHANGES.md
git commit -m "Audit Tab: compute all stats, cards, and charts from filtered dataset

- renderStats/renderCharts render an empty state when filters match 0 rows
- Add hasActiveFilters() and activeFilterSummary() helpers
- PDF export uses S.filtered as single source for KPIs and anomaly table
- Rename 'Reporting Period' box to 'Reporting Scope' and reflect all filters
- Warn user before exporting a PDF with a zero-row filter
- Filter badge + 'of N total' hint on the Tickets card when filtered"
git push -u origin audit-tab-filtered-stats
```

Then open a Pull Request on GitHub against `main`.

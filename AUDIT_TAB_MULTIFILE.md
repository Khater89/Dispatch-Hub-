# Audit Tab — Multi-File Validation

Two side-by-side modes are exposed at the top of the page:

1. **Single Workbook** — keep using a pre-built `.xlsx` that already has
   the IE/FN side-by-side `Report` sheet inside.
2. **Multi-File Validation** — drop the three raw source files and let
   the engine merge and validate them from scratch.

Both modes share the same dashboard, filters, summary cards, charts,
correction tracking and PDF export.

---

## Multi-File mode — pipeline

### 1. Auto-detect by columns (not by filename)

Each upload slot detects which file it received from the columns it
finds, regardless of the filename. Files dropped into the wrong slot
are auto-routed to the right one.

| Slot                       | Required signature columns                                                        |
| -------------------------- | --------------------------------------------------------------------------------- |
| **IE Report**              | `Tkt Num`, `Tkt Status`, `Ticket Type`, `Company Name`, `FE Name`                 |
| **Sheet1** (addresses)     | `Tkt Num`, `Address 1`, `City`, `State`                                            |
| **FN Report**              | `WO ID`, `Custom: Acuative Ticket Number`, `WO Status`, `Tech Name`, `Service Date` |

### 2. 1-2-3 copy onto the Master layout

Uploaded sheets are copied positionally onto the Master sheet templates
(`IE Report`, `FN Report`, `Sheet1`). Column 1 of the upload goes into
column 1 of the Master, column 2 into column 2, etc. This means the
exported Excel workbook has the same shape the analysts already know.

### 3. Validation matches the Master formulas

For every IE row, the engine looks up the matching FN row by
`Acuative Ticket` and the matching address row by `Tkt Num`, then runs
the same five checks the Master spreadsheet runs:

- **Status** (column AA in the Master): `S+Assigned`, `U+(Published|Routed)`,
  `H+Not Posted`, or `non-FN+Not Posted` are OK; anything else is Error.
- **Due** (column AB): `H` or non-FN are auto-OK; otherwise IE Due Date
  AND IE Due Time must equal FN Service Date AND FN Service Time.
- **Scheduled** (column AC): only enforced when FN Status = Assigned.
- **Tech** (column AD): `H` or non-FN are auto-OK; otherwise IE FE Name
  must equal FN Tech Name (case-insensitive).
- **Confirmed** (column AE): `Assignment Confirmed = No` → Error.

The engine additionally splits the Due check into Date-only and Time-only
results, so the dashboard cards "Date Errs" and "Time Errs" can show
distinct counts and ITD / ITR exceptions can be applied (ITD-Date and
ITD/ITR-Time mismatches count as Matched-via-exception, not as errors).

### 4. Field-Nation-only counting

Single-Workbook mode skips any row where `Assigned Company ≠ Field Nation`:
```js
if(normU(r[12])!=='FIELD NATION') continue;
```
Multi-File mode mirrors that exactly. Non-Field-Nation rows are still
written to the exported `Report` sheet (so the workbook is complete) but
are not counted in the dashboard cards. This is what makes the two modes
produce the same numbers given the same data.

### 5. Filtered statistics — single source of truth

All dashboard cards, charts, the Excel export and the PDF export read
from `S.filtered`. With no filter active that equals the full Field-Nation
result set; with any filter active every metric reflects the filtered
rows only and a "Filtered" badge appears on the Tickets card. When a
filter returns zero rows the dashboard switches to a clear empty-state
panel with a one-click reset button.

---

## Why the multi-file numbers may differ from a Single-Workbook upload

The two modes apply the same logic to whatever data they receive. A
Single-Workbook upload of a daily Validation Report contains only the
tickets that report covers (e.g. 132 for one day). A multi-file run
against a full Labor Report covers every Field-Nation ticket in that
labor extract (could be thousands), so it will naturally show many more
tickets — even though the per-row checks themselves are identical.

---

## Files changed

Single file — `validation_tool/index.html`:

- HTML for the Mode tab switcher and the three Multi-File upload slots.
- CSS for the mode tabs, upload slot states, filter badge, empty state,
  and chart empty placeholders.
- JS for the multi-file pipeline (`mfReadFile`, `detectSlot`,
  `mfHandleUpload`, `mfRows123`, `mfBuildMasterRow`, `mfDueDateOnly`,
  `mfDueTimeOnly`, `mfGenerateReport`, `mfExportExcel`,
  `initMultiFileMode`).
- Updates to `renderStats` / `renderCharts` for the empty state.
- PDF export reads `S.filtered` as the single source of truth.

No backend, build, or config changes.

---

## Manual test checklist

1. Page loads with Single Workbook tab active and no error banner.
2. Click Multi-File — dropzone hides, three upload slots appear.
3. Upload IE / IE2 / FN files in any order; auto-detection routes
   misplaced files to the right slot.
4. Click Generate — the dashboard appears, the Tickets card shows the
   Field-Nation ticket count (not the raw IE row count), the banner
   confirms how many non-FN rows were skipped.
5. Apply a Status / Type / Date filter — the Tickets card and all four
   error cards update; a "Filtered" badge appears.
6. Apply a search that matches nothing — the cards collapse into the
   empty-state panel; charts show "No data for current filters".
7. Click the per-row Correct button — Open Errors decreases, Corrected
   increases.
8. Click Export Excel — the workbook contains Report, Analytics Summary,
   IE Report, FN Report, Sheet1.
9. Click Export Management PDF — the header reads "Scope: Filtered (X/N)"
   when a filter is active and "Scope: All Data" otherwise; KPI cards
   and the anomaly table use the filtered set.

---

## Commit to GitHub

```bash
cd /path/to/your/Dispatch-Hub
git checkout -b audit-tab-multifile
cp /path/to/download/validation_tool/index.html validation_tool/index.html
cp /path/to/download/AUDIT_TAB_MULTIFILE.md .
git add validation_tool/index.html AUDIT_TAB_MULTIFILE.md
git commit -m "Audit tab: Multi-File mode + filtered-stats single source of truth"
git push -u origin audit-tab-multifile
```

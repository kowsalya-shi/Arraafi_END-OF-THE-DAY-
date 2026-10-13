# Kowsalya Files - Conversion Guide

## Overview

Your Excel files have complex structures that need to be converted before importing into the system.

## Files Analyzed

### 1. ❌ Arraafi-kowsalya-Daily-Training-Status-260710-V110.xlsx
**Issues:**
- Multiple header rows (3-4 rows before data)
- Merged cells for module groupings
- Complex nested structure (Module > Sub Module > Topics)
- Headers spread across multiple rows

**Current Structure:**
```
Row 1-3: Title headers and metadata
Row 4: Column headers
Row 5+: Data rows (topics)
```

### 2. ⚠️ Arraafi-Kowsalya-Daily-Work-Plan-Status-Tracker-20260905-V120.xlsx
**Issues:**
- Minor: Column name "Actions" instead of "Action"
- Status values: "WIP" and "completed" (mixed case) ✅ Already supported!
- Has "S N" row number column (can be ignored)

**Current Structure:**
```
Row 1: Headers (S N, Actions, How, Who, When, Start Date, Completion Date, Status, Comp %, Remarks)
Row 2+: Data rows
```

## Solution: Conversion Script

I've created `convert-kowsalya-files.mjs` to automatically convert your files.

## How to Use

### Step 1: Place Files
Put your Excel files in the project root directory:
```
Company-Eod-Site/
  ├── Arraafi-Kowsalya-Daily-Work-Plan-Status-Tracker-20260905-V120.xlsx
  ├── Arraafi-kowsalya-Daily-Training-Status-260710-V110.xlsx
  └── convert-kowsalya-files.mjs
```

### Step 2: Run Conversion
```bash
node convert-kowsalya-files.mjs
```

### Step 3: Get Converted Files
The script creates:
- `import-ready-daily-work.xlsx` - Ready to import as Daily Work
- `import-ready-training.xlsx` - Ready to import as Training

## What the Conversion Does

### For Daily Work:
✅ Maps "Actions" → "Action"
✅ Normalizes status values (WIP → wip, completed → completed)
✅ Extracts completion percentage from "Comp %" field
✅ Maps "When" → "Date"
✅ Removes empty rows
✅ Creates clean, flat structure

**Result Format:**
| Action | Date | How | Who | Start Date | Completion Date | Status | Completion % | Remarks |
|--------|------|-----|-----|------------|-----------------|--------|--------------|---------|
| Training | 12/10/25 | Study | Team | 12/11/25 | | wip | 70 | In progress |

### For Training:
✅ Extracts topic rows from complex structure
✅ Skips module/sub-module headers
✅ Maps date columns (Planned Start → Start Date, etc.)
✅ Normalizes status values
✅ Adds default category and trainer
✅ Calculates progress based on status
✅ Removes empty rows and non-topic rows

**Result Format:**
| Topic | Category | Trainer | Start Date | End Date | Status | Progress % | Remarks |
|-------|----------|---------|------------|----------|--------|------------|---------|
| What is full-stack development? | Full Stack Development | ARRAAFI Training Team | 12/10/25 | 12/11/25 | completed | 100 | Completed |

## Import Steps

### 1. Convert Files
```bash
node convert-kowsalya-files.mjs
```

### 2. Import Daily Work
1. Go to EOD Portal → Daily Work
2. Click "Import" button
3. Upload `import-ready-daily-work.xlsx`
4. Select user and team
5. Click "Import"

### 3. Import Training
1. Go to EOD Portal → Training
2. Click "Import" button  
3. Upload `import-ready-training.xlsx`
4. Select user and team
5. Click "Import"

## Expected Results

### Daily Work Import
- **Total rows:** ~60+ work records
- **Status breakdown:**
  - Completed: ~55 records
  - WIP: ~5-8 records
  - YTS: ~0-2 records

### Training Import
- **Total rows:** ~100+ training topics
- **Status breakdown:**
  - Completed: ~80+ topics
  - WIP: ~10-15 topics
  - YTS: ~5-10 topics

## Troubleshooting

### "No file found" error
- Make sure the Excel files are in the root directory
- Check the filenames match exactly (case-sensitive on Linux)

### "No valid records found"
- The script couldn't parse the file structure
- Try opening the Excel file and checking:
  - Is there a "Topics Covered" column?
  - Is there a "Status" column?
  - Are there actual data rows (not just headers)?

### Import validation errors
- Check the generated files before importing
- Open `import-ready-*.xlsx` files and verify:
  - Headers are in row 1
  - Data starts in row 2
  - No empty rows between data
  - Status values are lowercase

## Manual Alternative

If the script doesn't work perfectly, you can manually convert:

### For Daily Work:
1. Open original file
2. Copy data rows (skip header)
3. Create new Excel with these headers:
   ```
   Action | Date | How | Who | Start Date | Completion Date | Status | Completion % | Remarks
   ```
4. Paste data
5. Change "WIP" to "wip", keep "completed" as is
6. Remove "%" symbol from Completion % column
7. Save as new file

### For Training:
1. Open original file
2. Find topic rows (skip module headers)
3. Create new Excel with these headers:
   ```
   Topic | Category | Trainer | Start Date | End Date | Status | Progress % | Remarks
   ```
4. Copy only rows with actual topics
5. Add category ("Full Stack Development") for all rows
6. Add trainer ("ARRAAFI Training Team") for all rows
7. Change "Completed" to "completed", "WIP" to "wip"
8. Save as new file

## Need Help?

Contact your system administrator if you encounter issues or need custom conversion logic for other file formats.

# Import File Structure Guide

## Current Import System Requirements

### Expected File Structure

All import files (Tasks, Daily Work, Training) should follow this simple structure:

```
Row 1: Column Headers (exact names matter)
Row 2: First data record
Row 3: Second data record
... and so on
```

### ❌ NOT Supported (Yet)
- Multiple header rows
- Merged cells
- Summary rows at top
- Complex nested structures
- Module/Sub-module hierarchies

## File Format Examples

### 1. Tasks Import Template

**Required Columns:**
- Task Name (required)
- Status (optional: yts, wip, completed, hold, cancelled)

**Optional Columns:**
- Task Code
- Priority (low, medium, high)
- How
- Who
- Assigned By
- Planned Start Date
- Planned End Date
- Actual Start Date
- Actual End Date
- Completion %
- Dependency
- Remarks
- ETC

**Example CSV:**
```csv
Task Name,Task Code,Status,Priority,Planned Start Date,Planned End Date,Completion %,Remarks
Complete project documentation,TASK-001,wip,high,2026-09-01,2026-09-15,50,In progress
Review code changes,TASK-002,completed,medium,2026-09-10,2026-09-12,100,Done
Setup database,TASK-003,yts,high,2026-09-20,2026-09-25,0,Not started
```

### 2. Daily Work Import Template

**Required Columns:**
- Action (required)
- Date (required)
- Status (optional: yts, wip, completed)

**Optional Columns:**
- How
- Who
- Assigned By
- Start Date
- Completion Date
- Completion %
- Remarks

**Example CSV:**
```csv
Action,Date,Status,How,Who,Start Date,Completion Date,Completion %,Remarks
Training session,2026-09-01,completed,Online meeting,John,2026-09-01,2026-09-01,100,Finished
Code review,2026-09-02,wip,Peer review,Team,2026-09-02,,50,Ongoing
Documentation,2026-09-03,yts,MS Word,Mary,,,0,Not started
```

### 3. Training Import Template

**Required Columns:**
- Topic (required)
- Status (optional: yts, wip, completed)

**Optional Columns:**
- Category
- Trainer
- Start Date
- End Date
- Progress %
- Remarks

**Example CSV:**
```csv
Topic,Category,Trainer,Start Date,End Date,Status,Progress %,Remarks
Java Basics,Programming,Mr. Smith,2026-09-01,2026-09-15,completed,100,Finished
React Framework,Frontend,Ms. Jones,2026-09-10,2026-09-25,wip,60,In progress
SQL Database,Database,Mr. Brown,2026-10-01,2026-10-15,yts,0,Not started
```

## Status Values

All status fields accept **case-insensitive** values and support multiple formats:

### For Tasks:
- **yts** (Yet to Start): yts, "yet to start", "not started", YTS, YET TO START
- **wip** (Work in Progress): wip, "work in progress", "in progress", WIP, IN PROGRESS
- **completed**: completed, complete, done, COMPLETED, COMPLETE, DONE
- **hold**: hold, holding, "on hold", HOLD, ON HOLD
- **cancelled**: cancelled, canceled, cancel, CANCELLED, CANCELED

### For Daily Work & Training:
- **yts**: yts, "yet to start", "not started"
- **wip**: wip, "work in progress", "in progress"
- **completed**: completed, complete, done

## Date Formats

All date fields support multiple formats:
- Excel date numbers (automatic conversion)
- YYYY-MM-DD (2026-09-15)
- MM/DD/YY (09/15/26)
- DD/MM/YYYY (15/09/2026)

## Tips for Success

1. **Use the first row for headers only**
2. **Remove empty rows** (system auto-filters them)
3. **Remove summary/total rows**
4. **Unmerge all cells**
5. **Use simple, flat structure**
6. **Test with a small file first** (5-10 rows)

## Converting Your Files

### From: Arraafi-kowsalya-Daily-Training-Status-260710-V110.xlsx
This file has:
- Multiple header rows ❌
- Merged cells ❌
- Complex module structure ❌

**To convert:**
1. Extract only the topic rows
2. Create simple headers: Topic, Start Date, End Date, Status
3. Remove all merged cells
4. Remove module/sub-module grouping

### From: Arraafi-Kowsalya-Daily-Work-Plan-Status-Tracker-20260905-V120.xlsx
This file is closer but has:
- "S N" column (row number) - can keep or remove
- Status values: "WIP", "completed" ✅ (supported)

**To convert:**
1. Keep existing structure (it's already good!)
2. Map columns:
   - Actions → Action
   - Start Date → Start Date
   - Completion Date → Completion Date
   - Status → Status (already good)
   - Comp % → Completion %

## Need Help?

If you have files in complex formats, we can:
1. Build a custom parser for your specific format
2. Create a conversion script
3. Add support for multi-header files

Contact your system administrator for assistance.

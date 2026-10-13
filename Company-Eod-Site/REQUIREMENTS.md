# EOD System Requirements

## Project Overview
End of Day (EOD) reporting and task management system for Arraafi Infotech.

---

## Feature Requirements

### Email & Notifications

| S.No | Short Task Name | Requirement |
|------|----------------|-------------|
| 13 | EOD Mail Configuration | Configure the system-generated EOD email account for automated notifications. |
| 14 | EOD Non-Submission Alert | If an employee does not submit EOD, send an email to the respective TL, IT Manager, Manager and CEO. |
| 15 | WIP Overdue Alert | If a task remains WIP for more than 5 days, send an escalation email to the relevant authorities. |
| 16 | YTS Overdue Alert | If a task remains YTS/Pending for more than 5 days, send an escalation email to the relevant authorities. |
| 17 | 3-Day EOD Escalation | If an employee continuously fails to submit EOD for 3 days, trigger the escalation email. |
| 18 | Role-Based Email Escalation | Email recipients should be determined according to the employee/TL/IT Manager reporting hierarchy. |

#### Email Escalation Hierarchy

**Employee does not submit EOD:**
- Employee's TL → IT Manager → Manager → CEO

**TL does not submit EOD:**
- IT Manager → Manager → CEO

**IT Manager does not submit EOD:**
- Manager → CEO

**Manager does not submit EOD:**
- CEO

**For WIP / YTS:**
- WIP/YTS task exceeding 5 days → Automatic escalation email + notification
- Should connect with Overdue Notifications section in the portal

---

### Import Functionality

| S.No | Short Task Name | Requirement |
|------|----------------|-------------|
| 19 | Task Import | Add Import option in the Task page. Imported records should be displayed in the Task list. |
| 20 | Daily Work Import | Add Import option in the Daily Work page. Imported records should be displayed in Daily Work. |
| 21 | Training Import | Add Import option in the Training page. Imported records should be displayed in Training. |
| 22 | Import Validation | Validate the imported file and show errors for invalid/missing data. |
| 23 | Import Confirmation | Show a success message after the records are imported successfully. |

#### Import Flow
1. **Import** → Select Excel/CSV
2. **Validate** → Check for invalid/missing data
3. **Upload** → Process the file
4. **Save** → Store records in database
5. **Display** → Show imported records on respective page

**Example:**
- Task Page → Import → `tasks.xlsx` → Import Successful → Tasks appear in Task Page
- Same flow for Daily Work and Training pages

#### Import File Format
- Supported formats: **Excel (.xlsx, .xls)** and **CSV (.csv)**
- Files should have proper column headers matching database fields
- Required fields must be present for validation to pass

---

## Status

### Completed Features ✅
- ✅ Email system (29/30 emails sent successfully)
- ✅ MIS Dashboard with role-based access
- ✅ Email configuration: eod_reports@arraafiinfotech.com
- ✅ Daily work to task auto-sync (18/18 records synced)
- ✅ Task Import Functionality (S.No 19)
- ✅ Daily Work Import Functionality (S.No 20)
- ✅ Training Import Functionality (S.No 21)
- ✅ Import Validation (S.No 22)
- ✅ Import Confirmation (S.No 23)

### Pending Features 🔄
- 🔄 EOD Non-Submission Alerts
- 🔄 WIP/YTS Overdue Alerts
- 🔄 3-Day EOD Escalation
- 🔄 Role-Based Email Escalation

---

## Technical Notes

### Email Configuration
- SMTP Host: mail.arraafiinfotech.com
- SMTP Port: 465
- Encryption: SSL
- From Email: eod_reports@arraafiinfotech.com

### Database
- PostgreSQL: `postgresql://postgres:Shiny@08@localhost:5432/eod_db`
- ORM: Drizzle

### Tech Stack
- Backend: TypeScript, Node.js, Express.js
- Frontend: React, TypeScript, TanStack Query
- Database: PostgreSQL
- Package Manager: pnpm (monorepo)

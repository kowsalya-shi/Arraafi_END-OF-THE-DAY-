import { Router, type Request } from "express";
import {
  db,
  usersTable,
  teamsTable,
  eodSubmissionsTable,
  portalNotificationsTable,
  internalTasksTable,
  dailyWorkTable,
  trainingRecordsTable,
  systemSettingsTable,
} from "@workspace/db";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import nodemailer from "nodemailer";
import { logger } from "../lib/logger";
import { sessions } from "./auth";
import { areEmailAlertsEnabled } from "./notificationSettings";

/**
 * Check if global email system is enabled (CEO control)
 */
async function isGlobalEmailEnabled(): Promise<boolean> {
  try {
    const [setting] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.settingKey, "global_email_enabled"));
    
    return setting?.settingValue === "true";
  } catch (err) {
    logger.error({ err }, "Failed to check global email setting");
    return true; // Default to enabled if check fails
  }
}

const router = Router();
const ALERT_EMAIL_OVERRIDES: Record<string, string> = {
  "Waseem Ahmed Jamadar": "waseem@gmail.com",
  "Thaseena Khanum": "Thaseena.Khanum@arraafiinfotech.com",
  "Asim Alam": "aap@arraafiinfotech.com",
  "Soubhagya M Bhat": "soubhgya@arraafiinfotech.com",
  "Rajshekar Swamy": "rajshekar@arraafiinfotech.com",
  "Amita Akash Mudholkar": "amita@arraafiinfotech.com",
  "Mohammad Javed Akhter": "javed@arraafiinfotech.com",
};

// Create transporter — configure via env vars if available
function getTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      // Support both current names and the company .env names provided.
      secure: (process.env.SMTP_SSL ?? process.env.SMTP_SECURE) === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS,
      },
    });
  }
  // Ethereal test account fallback for dev
  return null;
}

/**
 * Send email only if the recipient has email alerts enabled
 * Returns true if sent, false if skipped or failed
 */
async function sendEmailIfEnabled(
  transporter: nodemailer.Transporter | null,
  recipientUserIds: number[],
  mailOptions: any
): Promise<{ sent: boolean; skipped: number[]; recipients: string[] }> {
  // First check if global email system is enabled (CEO control)
  const globalEnabled = await isGlobalEmailEnabled();
  if (!globalEnabled) {
    logger.info({ subject: mailOptions.subject }, "Email blocked - global email system disabled by CEO");
    return { sent: false, skipped: recipientUserIds, recipients: [] };
  }

  if (!transporter) {
    logger.info({ mailOptions }, "DEV: Would send email");
    return { sent: true, skipped: [], recipients: [] };
  }

  // Check email alert settings for all recipients
  const enabledRecipients: number[] = [];
  const skippedRecipients: number[] = [];

  for (const userId of recipientUserIds) {
    const alertsEnabled = await areEmailAlertsEnabled(userId);
    if (alertsEnabled) {
      enabledRecipients.push(userId);
    } else {
      skippedRecipients.push(userId);
    }
  }

  // If all recipients have email alerts disabled, skip sending
  if (enabledRecipients.length === 0) {
    logger.info({ 
      skipped: skippedRecipients.length,
      subject: mailOptions.subject 
    }, "Email not sent - all recipients have email alerts disabled");
    return { sent: false, skipped: skippedRecipients, recipients: [] };
  }

  // Send email
  try {
    await transporter.sendMail(mailOptions);
    logger.info({
      sent: enabledRecipients.length,
      skipped: skippedRecipients.length,
      subject: mailOptions.subject
    }, "Email sent successfully");
    return { sent: true, skipped: skippedRecipients, recipients: mailOptions.to.split(", ") };
  } catch (err) {
    logger.error({ err, mailOptions }, "Failed to send email");
    return { sent: false, skipped: skippedRecipients, recipients: [] };
  }
}

async function getPendingEmployees(date: string, teamId?: number) {
  const submitted = await db
    .select({ userId: eodSubmissionsTable.userId })
    .from(eodSubmissionsTable)
    .where(eq(eodSubmissionsTable.date, date));

  const submittedIds = new Set(submitted.map(s => s.userId));

  let employees = await db.select().from(usersTable).where(eq(usersTable.role, "employee"));
  if (teamId) employees = employees.filter(e => e.teamId === teamId);

  return employees.filter(e => !submittedIds.has(e.id));
}

function getSession(req: Request) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? sessions.get(authHeader.slice(7)) : undefined;
}

export async function createPortalNotification(recipientUserId: number, employeeId: number, type: string, title: string, message: string, targetDate: string, relatedTaskId?: number) {
  const [existing] = await db.select({ id: portalNotificationsTable.id }).from(portalNotificationsTable).where(and(
    eq(portalNotificationsTable.recipientUserId, recipientUserId),
    eq(portalNotificationsTable.employeeId, employeeId),
    eq(portalNotificationsTable.type, type),
    eq(portalNotificationsTable.targetDate, targetDate),
  ));
  if (existing) return false;

  const [recipient] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, recipientUserId));
  if (!recipient) return false;
  await db.insert(portalNotificationsTable).values({ recipientUserId, recipientRole: recipient.role, employeeId, relatedTaskId: relatedTaskId ?? null, type, title, message, targetDate });
  return true;
}

type RoleScopedMessages = { self: string; team: string; management: string; actor?: string };

/**
 * Creates separate rows only for the affected person and their reporting line.
 * A Team Lead is selected solely from the affected user's team; no other TL can
 * receive the event. Manager, IT Manager, and CEO recipients get the management
 * wording, while the affected person receives the personal wording.
 */
export async function notifyRoleScopedEvent(
  affectedUserId: number,
  teamId: number | null,
  type: string,
  title: string,
  messages: RoleScopedMessages,
  targetDate: string,
  relatedTaskId?: number,
  actorUserId?: number | null,
) {
  const recipients = new Map<number, "self" | "team" | "management">();
  recipients.set(affectedUserId, "self");
  const effectiveTeamId = teamId ?? (await db.select({ teamId: usersTable.teamId }).from(usersTable).where(eq(usersTable.id, affectedUserId)))[0]?.teamId;
  if (effectiveTeamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, effectiveTeamId));
    if (team?.tlId && team.tlId !== affectedUserId) recipients.set(team.tlId, "team");
    if (team?.managerId && team.managerId !== affectedUserId) recipients.set(team.managerId, "management");
  }
  const leadership = await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.role, ["it_manager", "ceo"]));
  leadership.forEach((user) => { if (user.id !== affectedUserId) recipients.set(user.id, "management"); });
  await Promise.all([...recipients].map(([recipientId, audience]) =>
    createPortalNotification(recipientId, affectedUserId, type, title, recipientId === actorUserId && messages.actor ? messages.actor : messages[audience], targetDate, relatedTaskId),
  ));
}

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function notifyEmployeeRecordDeleted(
  employeeId: number | null,
  teamId: number | null,
  recordType: "Daily Work" | "EOD Report" | "Training Record",
  recordName: string,
  recordId: number,
) {
  if (!employeeId) return;

  const [employee] = await db.select().from(usersTable).where(eq(usersTable.id, employeeId));
  const effectiveTeamId = teamId ?? employee?.teamId;
  const recipients = new Set<number>();
  if (effectiveTeamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, effectiveTeamId));
    if (team?.tlId) recipients.add(team.tlId);
    if (team?.managerId) recipients.add(team.managerId);
  }

  const leadership = await db.select({ id: usersTable.id }).from(usersTable)
    .where(inArray(usersTable.role, ["manager", "ceo"]));
  leadership.forEach((user) => recipients.add(user.id));

  const employeeName = employee?.name ?? "An employee";
  const message = `${employeeName} deleted ${recordType.toLowerCase()} "${recordName}". Please review if follow-up is needed.`;
  await Promise.all([...recipients]
    .filter((recipientId) => recipientId !== employeeId)
    .map((recipientId) => createPortalNotification(
      recipientId,
      employeeId,
      `deleted_${recordType.toLowerCase().replaceAll(" ", "_")}_${recordId}`,
      `${recordType} Deleted`,
      message,
      todayLocal(),
    )));
}

function previousCalendarDate(date: string, daysBefore: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - daysBefore);
  return value.toISOString().slice(0, 10);
}

async function countRecentMissedEods(userId: number, targetDate: string, lookbackDays: number = 30) {
  // Look back over the past N days to count how many EODs were missed
  const dates: string[] = [];
  for (let i = 0; i < lookbackDays; i++) {
    dates.push(previousCalendarDate(targetDate, i));
  }

  const submissions = await db
    .select({ date: eodSubmissionsTable.date })
    .from(eodSubmissionsTable)
    .where(and(
      eq(eodSubmissionsTable.userId, userId),
      inArray(eodSubmissionsTable.date, dates),
    ));

  const submittedDates = new Set(submissions.map(s => s.date));
  const missedDates = dates.filter(date => !submittedDates.has(date));
  
  return {
    missedCount: missedDates.length,
    missedDates: missedDates.slice(0, 5), // Return up to 5 most recent missed dates
  };
}

async function emailMissingEodToLeadership(
  user: typeof usersTable.$inferSelect,
  team: typeof teamsTable.$inferSelect | null,
  targetDate: string,
) {
  // Determine recipients based on user's role
  let recipientIds: number[] = [];
  
  if (user.role === "employee") {
    // Employee → TL + IT Manager + Manager + CEO
    const leadership = await db.select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(inArray(usersTable.role, ["ceo", "it_manager", "manager"]));
    
    recipientIds = [
      team?.tlId,
      ...leadership.map(u => u.id)
    ].filter((id): id is number => id !== null);
    
  } else if (user.role === "tl") {
    // TL → IT Manager + Manager + CEO (NOT other TLs)
    const leadership = await db.select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(inArray(usersTable.role, ["ceo", "it_manager", "manager"]));
    
    recipientIds = leadership.map(u => u.id);
    
  } else if (user.role === "it_manager") {
    // IT Manager → Manager + CEO
    const leadership = await db.select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(inArray(usersTable.role, ["ceo", "manager"]));
    
    recipientIds = leadership.map(u => u.id);
    
  } else if (user.role === "manager") {
    // Manager → CEO only
    const [ceo] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "ceo"));
    
    if (ceo) recipientIds = [ceo.id];
    
  } else if (user.role === "ceo") {
    // CEO → No escalation
    return { sent: false, recipients: [] as string[] };
  }

  if (!recipientIds.length) return { sent: false, recipients: [] as string[] };

  const recipients = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.id, recipientIds));
    
  const configuredEmails = [
    process.env.IT_MANAGER_EMAIL,
    process.env.CEO_EMAIL,
    process.env.MANAGER_EMAIL,
    ...(process.env.TL_EMAILS ?? "").split(",").map((email) => email.trim()),
  ].filter((email): email is string => !!email);
  
  const emails = [...new Set([
    ...configuredEmails,
    ...recipients.map((recipient) => ALERT_EMAIL_OVERRIDES[recipient.name] ?? recipient.email)
  ].filter((email): email is string => !!email))];
  
  if (!emails.length) return { sent: false, recipients: emails };

  const roleLabel = user.role === "tl" ? "Team Lead" : user.role === "it_manager" ? "IT Manager" : user.role === "manager" ? "Manager" : user.role === "ceo" ? "CEO" : "Employee";
  const subject = `[EOD Missing] ${user.name} (${roleLabel}) has not submitted EOD for ${targetDate}`;
  const html = `<p>Dear Team Lead / Manager,</p>
    <p><strong>${user.name}</strong> (${user.email}) - <strong>${roleLabel}</strong> has not submitted their EOD report for <strong>${targetDate}</strong>.</p>
    ${team ? `<p>Team: <strong>${team.name}</strong></p>` : ''}
    <p>This notification is sent according to the reporting hierarchy. Please follow up with the person.</p>
    <br/><p>Regards,<br/>Arraafi Task Management Portal</p>`;
    
  const transporter = getTransporter();
  
  const result = await sendEmailIfEnabled(
    transporter,
    recipientIds,
    {
      from: `"Arraafi Task Management Portal" <${process.env.SMTP_USER ?? "noreply@arraafiinfotech.com"}>`,
      to: emails.join(", "),
      subject,
      html,
    }
  );
  
  return { sent: result.sent, recipients: result.recipients }
}

async function sendAgeingTaskEmail(
  employee: typeof usersTable.$inferSelect,
  team: typeof teamsTable.$inferSelect | null,
  task: typeof internalTasksTable.$inferSelect,
  ageDays: number,
  statusLabel: string,
  targetDate: string,
) {
  // Determine recipients based on role hierarchy (same as EOD)
  let recipientIds: number[] = [];
  
  if (employee.role === "employee") {
    // Employee → TL + IT Manager + Manager + CEO
    const leadership = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.role, ["ceo", "it_manager", "manager"]));
    
    recipientIds = [
      team?.tlId,
      ...leadership.map(u => u.id)
    ].filter((id): id is number => id !== null);
    
  } else if (employee.role === "tl") {
    // TL → IT Manager + Manager + CEO
    const leadership = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.role, ["ceo", "it_manager", "manager"]));
    
    recipientIds = leadership.map(u => u.id);
    
  } else if (employee.role === "it_manager") {
    // IT Manager → Manager + CEO
    const leadership = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.role, ["ceo", "manager"]));
    
    recipientIds = leadership.map(u => u.id);
    
  } else if (employee.role === "manager") {
    // Manager → CEO only
    const [ceo] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "ceo"));
    
    if (ceo) recipientIds = [ceo.id];
  }

  if (!recipientIds.length) return false;

  const recipients = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.id, recipientIds));
    
  const emails = recipients.map(r => ALERT_EMAIL_OVERRIDES[r.name] ?? r.email);
  
  if (!emails.length) return false;

  const roleLabel = employee.role === "tl" ? "Team Lead" : 
                    employee.role === "it_manager" ? "IT Manager" : 
                    employee.role === "manager" ? "Manager" : 
                    employee.role === "ceo" ? "CEO" : "Employee";

  const subject = `[AGEING TASK] ${employee.name} - Task in ${statusLabel} for ${ageDays} days`;
  const html = `<div style="font-family: Arial, sans-serif; max-width: 600px;">
    <h2 style="color: #f59e0b;">⚠️ Ageing Task Alert</h2>
    <p><strong>${employee.name}</strong> (${roleLabel}) has a task that has been in <strong>${statusLabel}</strong> status for <strong>${ageDays} days</strong>.</p>
    ${team ? `<p>Team: <strong>${team.name}</strong></p>` : ''}
    
    <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold;">Task Details:</p>
      <ul style="margin: 10px 0;">
        <li><strong>Task Name:</strong> ${task.taskName}</li>
        <li><strong>Task Code:</strong> ${task.taskCode || 'N/A'}</li>
        <li><strong>Status:</strong> ${statusLabel}</li>
        <li><strong>Days in Status:</strong> ${ageDays} days</li>
        <li><strong>Priority:</strong> ${task.priority || 'Normal'}</li>
      </ul>
    </div>
    
    <p><strong>Action Required:</strong> Task has been stuck in ${statusLabel} for more than 5 days. Please follow up to identify blockers and ensure progress.</p>
    <br/><p>Regards,<br/><strong>Arraafi EOD System</strong><br/><em>eod_reports@arraafiinfotech.com</em></p>
  </div>`;
    
  const transporter = getTransporter();
  
  const result = await sendEmailIfEnabled(
    transporter,
    recipientIds,
    {
      from: `"Arraafi EOD System" <${process.env.SMTP_USER ?? "eod_reports@arraafiinfotech.com"}>`,
      to: emails.join(", "),
      subject,
      html,
    }
  );
  
  if (result.sent) {
    logger.info({ to: emails, taskId: task.id, ageDays }, "Sent ageing task escalation email");
  }
  
  return result.sent;
}

export async function processAgeingTaskNotifications(targetDate: string) {
  // Check tasks that are in YTS, WIP, or Holding status for >= 5 days
  const tasks = await db.select().from(internalTasksTable)
    .where(inArray(internalTasksTable.status, ["yts", "wip", "holding"]));

  let created = 0;
  let emailsSent = 0;
  const ageingThresholdDays = 5;

  for (const task of tasks) {
    if (!task.userId || !task.teamId) continue;

    // Determine the date to calculate age from
    let startDate: string | null = null;
    
    // Use actual start date if available, otherwise use when task entered current status
    if (task.status === "wip" && task.actualStartDate) {
      startDate = task.actualStartDate;
    } else if (task.status === "yts" && task.plannedStartDate) {
      startDate = task.plannedStartDate;
    } else if (task.createdAt) {
      startDate = task.createdAt.toISOString().split('T')[0];
    }

    if (!startDate) continue;

    // Calculate days in current status
    const ageMs = Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    if (ageDays < ageingThresholdDays) continue;

    // Check if we already created an ageing notification for this task recently
    const existingNotification = await db.select({ id: portalNotificationsTable.id })
      .from(portalNotificationsTable)
      .where(and(
        eq(portalNotificationsTable.relatedTaskId, task.id),
        eq(portalNotificationsTable.type, `ageing_task_${task.id}`)
      ))
      .limit(1);

    if (existingNotification.length > 0) continue; // Already notified about this ageing task

    const [employee] = await db.select().from(usersTable).where(eq(usersTable.id, task.userId));
    if (!employee) continue;

    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, task.teamId));

    const statusLabel = task.status.toUpperCase();
    const employeeMessage = `Your task "${task.taskName}" has been in ${statusLabel} for ${ageDays} days.`;
    const teamMessage = `${employee.name}'s task "${task.taskName}" has been in ${statusLabel} for ${ageDays} days.`;

    // Create notifications using the existing role-scoped notification system
    await notifyRoleScopedEvent(
      task.userId,
      task.teamId,
      `ageing_task_${task.id}`,
      "Ageing Task Alert",
      {
        self: employeeMessage,
        team: teamMessage,
        management: teamMessage,
      },
      targetDate,
      task.id
    );

    created++;

    // Send escalation email to leadership hierarchy
    if (await sendAgeingTaskEmail(employee, team, task, ageDays, statusLabel, targetDate)) {
      emailsSent++;
    }
  }

  return { created, emailsSent };
}

export async function processMissingEodNotifications(targetDate: string) {
  // Get ALL users who should submit EOD (employees, TLs, IT Manager, Manager, CEO)
  const allUsers = await db.select().from(usersTable);
  
  const submitted = await db
    .select({ userId: eodSubmissionsTable.userId })
    .from(eodSubmissionsTable)
    .where(eq(eodSubmissionsTable.date, targetDate));

  const submittedIds = new Set(submitted.map(s => s.userId));
  const usersWithoutEod = allUsers.filter(u => !submittedIds.has(u.id));

  let created = 0;
  let emailsSent = 0;

  for (const user of usersWithoutEod) {
    const team = user.teamId ? (await db.select().from(teamsTable).where(eq(teamsTable.id, user.teamId)))[0] : null;

    const roleLabel = user.role === "tl" ? "Team Lead" : user.role === "it_manager" ? "IT Manager" : user.role === "manager" ? "Manager" : user.role === "ceo" ? "CEO" : "Employee";
    const message = `${user.name} (${roleLabel}) did not submit an EOD for ${targetDate}.`;
    
    const before = await db.select({ id: portalNotificationsTable.id })
      .from(portalNotificationsTable)
      .where(and(
        eq(portalNotificationsTable.employeeId, user.id),
        eq(portalNotificationsTable.type, "missing_eod"),
        eq(portalNotificationsTable.targetDate, targetDate)
      ));

    await notifyRoleScopedEvent(user.id, team?.id ?? null, "missing_eod", "Missing EOD", {
      self: `Your EOD has not been submitted for ${targetDate}.`,
      team: message,
      management: message,
    }, targetDate);

    const isNewMissingEod = before.length === 0;
    if (isNewMissingEod) created += 1;
    
    // Send email to leadership when EOD is missing
    if (isNewMissingEod && (await emailMissingEodToLeadership(user, team, targetDate)).sent) {
      emailsSent++;
    }

    // 3-DAY ESCALATION: Only for Employee and TL roles
    if (user.role !== "employee" && user.role !== "tl") {
      continue; // Skip escalation for IT Manager, Manager, CEO
    }

    const { missedCount, missedDates } = await countRecentMissedEods(user.id, targetDate, 30);
    
    if (missedCount < 3) continue; // Need at least 3 missed days

    // Check if we already sent an escalation for this user recently
    const recentEscalation = await db.select({ id: portalNotificationsTable.id })
      .from(portalNotificationsTable)
      .where(and(
        eq(portalNotificationsTable.employeeId, user.id),
        eq(portalNotificationsTable.type, "missing_eod_escalation")
      ))
      .orderBy(desc(portalNotificationsTable.createdAt))
      .limit(1);

    // If there's a recent escalation (within 7 days), don't send another
    if (recentEscalation.length > 0) {
      const lastEscalationDate = recentEscalation[0].id; // We'll skip for now
      continue;
    }

    // SEND 3-DAY ESCALATION
    let escalationRecipientIds: number[] = [];
    
    if (user.role === "employee") {
      // Employee escalation → TL + IT Manager + Manager + CEO
      const leadership = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(inArray(usersTable.role, ["ceo", "it_manager", "manager"]));
      
      escalationRecipientIds = [
        team?.tlId,
        ...leadership.map(u => u.id)
      ].filter((id): id is number => id !== null);
      
    } else if (user.role === "tl") {
      // TL escalation → IT Manager + Manager + CEO
      const leadership = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(inArray(usersTable.role, ["ceo", "it_manager", "manager"]));
      
      escalationRecipientIds = leadership.map(u => u.id);
    }

    const escalationMessage = `${user.name} (${roleLabel}) has missed ${missedCount} EOD submissions in the past 30 days. Recent missed dates: ${missedDates.join(", ")}. Please follow up urgently.`;
    
    // Create portal notifications for escalation recipients
    for (const recipientId of new Set(escalationRecipientIds)) {
      if (await createPortalNotification(
        recipientId,
        user.id,
        "missing_eod_escalation",
        "EOD Escalation Alert",
        escalationMessage,
        targetDate
      )) {
        created++;
      }
    }

    // Send escalation email
    const escalationRecipients = await db.select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, escalationRecipientIds));
      
    const escalationEmails = escalationRecipients.map(r => ALERT_EMAIL_OVERRIDES[r.name] ?? r.email);
    
    if (escalationEmails.length > 0) {
      const transporter = getTransporter();
      
      const result = await sendEmailIfEnabled(
        transporter,
        escalationRecipientIds,
        {
          from: `"Arraafi Task Management Portal" <${process.env.SMTP_USER ?? "noreply@arraafiinfotech.com"}>`,
          to: escalationEmails.join(", "),
          subject: `[ESCALATION] ${user.name} - ${missedCount} EOD Reports Missing`,
          html: `<div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2 style="color: #dc2626;">⚠️ EOD Escalation Alert</h2>
            <p><strong>${user.name}</strong> (${roleLabel}) has missed <strong>${missedCount} EOD submissions</strong> in the past 30 days.</p>
            ${team ? `<p>Team: <strong>${team.name}</strong></p>` : ''}
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold;">Recent Missed Dates:</p>
              <ul style="margin: 10px 0;">
                ${missedDates.map(d => `<li>${d}</li>`).join('')}
              </ul>
            </div>
            <p><strong>Action Required:</strong> Please follow up with ${user.name} urgently regarding their EOD submission compliance.</p>
            <br/><p>Regards,<br/><strong>Arraafi Task Management Portal</strong></p>
          </div>`,
        }
      );
      
      if (result.sent) {
        emailsSent++;
      }
    }
  }

  return { pending: usersWithoutEod.length, created, emailsSent };
}

function isMoreThanOneWeekOld(itemDate: string | null, targetDate: string) {
  if (!itemDate) return false;
  const ageMs = Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${itemDate}T00:00:00Z`);
  return ageMs > 7 * 24 * 60 * 60 * 1000;
}

async function notifyTlAboutOverdueItem(
  kind: "task" | "daily_work" | "training",
  itemId: number,
  title: string,
  itemDate: string | null,
  status: string,
  employeeId: number | null,
  teamId: number | null,
  targetDate: string,
) {
  if (!employeeId || !teamId || !isMoreThanOneWeekOld(itemDate, targetDate)) return 0;
  if (status === "completed" || status === "cancelled") return 0;

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  const [employee] = await db.select().from(usersTable).where(eq(usersTable.id, employeeId));
  if (!employee || !itemDate) return 0;

  const notificationType = `overdue_${kind}_${itemId}`;
  const notificationTitle = `Overdue ${kind === "daily_work" ? "Daily Work" : kind === "training" ? "Training" : "Task"}`;
  const message = `${employee.name}'s ${kind === "daily_work" ? "daily work" : kind} "${title}" has been pending since ${itemDate}.`;
  const before = await db.select({ id: portalNotificationsTable.id }).from(portalNotificationsTable).where(and(eq(portalNotificationsTable.employeeId, employeeId), eq(portalNotificationsTable.type, notificationType), eq(portalNotificationsTable.targetDate, itemDate)));
  await notifyRoleScopedEvent(employeeId, teamId, notificationType, notificationTitle, {
    self: `Your ${kind === "daily_work" ? "daily work" : kind} "${title}" is overdue.`,
    team: message,
    management: message,
  }, itemDate, kind === "task" ? itemId : undefined);
  return before.length === 0 ? 1 : 0;
}

export async function processOverdueWorkNotifications(targetDate: string) {
  let created = 0;
  const [tasks, dailyWork, training] = await Promise.all([
    db.select().from(internalTasksTable),
    db.select().from(dailyWorkTable),
    db.select().from(trainingRecordsTable),
  ]);

  for (const task of tasks) {
    created += await notifyTlAboutOverdueItem(
      "task", task.id, task.taskName, task.plannedEndDate ?? task.plannedStartDate,
      task.status, task.userId, task.teamId, targetDate,
    );
  }
  for (const work of dailyWork) {
    created += await notifyTlAboutOverdueItem(
      "daily_work", work.id, work.action, work.date,
      work.status, work.userId, work.teamId, targetDate,
    );
  }
  for (const record of training) {
    created += await notifyTlAboutOverdueItem(
      "training", record.id, record.topic, record.endDate ?? record.startDate,
      record.status, record.userId, record.teamId, targetDate,
    );
  }

  return { created };
}

router.get("/notifications", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  // Alerts are useful for a short time only. Unread alerts older than two days
  // are no longer returned to the portal.
  const visibleAfter = new Date();
  visibleAfter.setDate(visibleAfter.getDate() - 2);
  const notifications = await db.select().from(portalNotificationsTable)
    .where(and(
      eq(portalNotificationsTable.recipientUserId, session.userId),
      gte(portalNotificationsTable.createdAt, visibleAfter),
    ))
    .orderBy(desc(portalNotificationsTable.createdAt))
    .limit(50);
  const [recipient] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, session.userId));
  // Hide previously-created overdue escalations from employees too. Other
  // notifications, such as approvals and rejections, still belong to them.
  res.json(recipient?.role === "employee" ? notifications.filter((item) => !item.type.startsWith("overdue_")) : notifications);
});

// Manager and CEO can review the audit trail without it mixing with their
// personal notification inboxes.
router.get("/audit-activities", async (req, res) => {
  const session = getSession(req);
  if (!session || !["manager", "ceo"].includes(session.role)) return res.status(403).json({ error: "Manager or CEO access required" });

  const records = await db.select().from(portalNotificationsTable).orderBy(desc(portalNotificationsTable.createdAt)).limit(250);
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const userName = new Map(users.map((user) => [user.id, user.name]));
  const activities = records.filter((record) =>
    record.type.startsWith("task_") || record.type.startsWith("daily_work_") || record.type.startsWith("eod_") || record.type.startsWith("training_"),
  ).map((record) => ({
    id: record.id,
    type: record.type,
    action: record.title,
    actorName: userName.get(record.employeeId) ?? "Unknown user",
    details: record.message,
    createdAt: record.createdAt?.toISOString(),
    targetDate: record.targetDate,
  }));
  res.json(activities);
});

// Opening the Notifications page acknowledges the recipient's current alerts.
// The alerts remain in the list, but no longer contribute to the unread badge.
router.patch("/notifications/read-all", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  await db.update(portalNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(portalNotificationsTable.recipientUserId, session.userId),
      isNull(portalNotificationsTable.readAt),
    ));

  res.json({ success: true });
});

// A notification becomes read only after the recipient opens its details.
router.patch("/notifications/:id/read", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  const id = parseInt(req.params.id);
  const [notification] = await db.update(portalNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(portalNotificationsTable.id, id), eq(portalNotificationsTable.recipientUserId, session.userId)))
    .returning();
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json(notification);
});

// A follow-up owner can resolve an escalation, or keep it open as unsolved.
router.patch("/notifications/:id/status", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  const id = parseInt(req.params.id);
  const solved = req.body?.solved === true;
  const [notification] = await db.update(portalNotificationsTable)
    .set({ readAt: solved ? new Date() : null })
    .where(and(eq(portalNotificationsTable.id, id), eq(portalNotificationsTable.recipientUserId, session.userId)))
    .returning();
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json(notification);
});

router.post("/notifications/send-reminder", async (req, res) => {
  const { date, teamId } = req.body;
  const targetDate = date || new Date().toISOString().split("T")[0];

  try {
    const pending = await getPendingEmployees(targetDate, teamId);
    let sent = 0;
    let failed = 0;

    for (const emp of pending) {
      logger.info({ empId: emp.id, email: emp.email }, "Sending reminder");
      
      const result = await sendEmailIfEnabled(
        transporter,
        [emp.id],
        {
          from: `"Arraafi EOD System" <${process.env.SMTP_USER ?? "noreply@arraafiinfotech.com"}>`,
          to: emp.email,
          subject: "EOD Reminder - Please submit your EOD",
          html: `<p>Dear ${emp.name},</p>
                 <p>This is a reminder to submit your End of Day (EOD) report before <strong>5:45 PM</strong> today (${targetDate}).</p>
                 <p>Please log in to the EOD portal and submit your report.</p>
                 <br/><p>Regards,<br/>Arraafi Infotech HR Team</p>`,
        }
      );
      
      if (result.sent) {
        sent++;
      } else {
        failed++;
      }
    }

    res.json({
      success: true,
      sent,
      failed,
      message: `Reminder sent to ${sent} employees, ${failed} failed`,
    });
  } catch (err) {
    logger.error({ err }, "Error sending reminders");
    res.status(500).json({ success: false, sent: 0, failed: 0, message: "Internal error" });
  }
});

router.post("/notifications/send-escalation", async (req, res) => {
  const { date, teamId } = req.body;
  const targetDate = date || new Date().toISOString().split("T")[0];

  try {
    const result = await processMissingEodNotifications(targetDate);
    res.json({
      success: true,
      sent: result.emailsSent,
      created: result.created,
      pending: result.pending,
      message: `Processed ${result.pending} missing EODs. Created ${result.created} notifications. Sent ${result.emailsSent} emails.`,
    });
  } catch (err) {
    logger.error({ err }, "Error in escalation endpoint");
    res.status(500).json({ success: false, sent: 0, failed: 0, message: "Internal error" });
  }
});

router.post("/notifications/check-ageing-tasks", async (req, res) => {
  const { date } = req.body;
  const targetDate = date || new Date().toISOString().split("T")[0];

  try {
    const result = await processAgeingTaskNotifications(targetDate);
    res.json({
      success: true,
      created: result.created,
      emailsSent: result.emailsSent,
      message: `Created ${result.created} ageing task notifications. Sent ${result.emailsSent} emails.`,
    });
  } catch (err) {
    logger.error({ err }, "Error checking ageing tasks");
    res.status(500).json({ success: false, created: 0, emailsSent: 0, message: "Internal error" });
  }
});

export default router;

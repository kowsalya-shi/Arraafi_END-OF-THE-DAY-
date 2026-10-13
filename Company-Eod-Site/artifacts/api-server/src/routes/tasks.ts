import { Router } from "express";
import { db, dailyWorkTable, internalTasksTable, taskReassignmentsTable, usersTable, teamsTable, portalNotificationsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { createPortalNotification, notifyRoleScopedEvent } from "./notifications";
import { sessions } from "./auth";
import { logTaskDeletion } from "../lib/audit";
import multer from "multer";
import { z } from "zod";
import { parseExcelFile, validateImportData, excelDateToString, mapHeaders, normalizePercentage } from "../lib/import-helper";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const optionalDate = (value: unknown) => typeof value === "string" && value.trim() === "" ? null : value;

function getSession(req: import("express").Request) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? sessions.get(authHeader.slice(7)) : undefined;
}

async function canReassignTask(actorId: number, actorRole: string, task: typeof internalTasksTable.$inferSelect, nextAssignee: typeof usersTable.$inferSelect) {
  if (["ceo", "it_manager"].includes(actorRole)) return true;
  if (actorRole === "employee") return false;
  if (actorRole === "tl") {
    const teams = await db.select().from(teamsTable).where(eq(teamsTable.tlId, actorId));
    const teamIds = teams.map((team) => team.id);
    return nextAssignee.role === "employee" && !!nextAssignee.teamId && teamIds.includes(nextAssignee.teamId) && (!task.teamId || teamIds.includes(task.teamId));
  }
  if (actorRole === "manager") {
    const teams = await db.select().from(teamsTable).where(eq(teamsTable.managerId, actorId));
    const teamIds = teams.map((team) => team.id);
    return !!nextAssignee.teamId && teamIds.includes(nextAssignee.teamId) && (!task.teamId || teamIds.includes(task.teamId));
  }
  return false;
}

function taskToDailyWorkValues(task: typeof internalTasksTable.$inferSelect) {
  return {
    action: task.taskName,
    how: task.how,
    who: task.who,
    assignedBy: task.assignedBy,
    date: task.plannedStartDate || todayLocal(),
    startDate: task.actualStartDate,
    completionDate: task.actualEndDate,
    status: task.status,
    completionPct: task.completionPct,
    remarks: task.remarks,
    userId: task.userId,
    teamId: task.teamId,
    sourceTaskId: task.id,
    approvalStatus: task.approvalStatus,
    approvedBy: task.approvedBy,
    approvedAt: task.approvedAt,
    rejectionReason: task.rejectionReason,
  };
}

async function syncDailyWorkFromTask(database: Pick<typeof db, "select" | "insert" | "update">, task: typeof internalTasksTable.$inferSelect) {
  if (!task.userId) return;
  const [existingWork] = await database.select({ id: dailyWorkTable.id }).from(dailyWorkTable).where(eq(dailyWorkTable.sourceTaskId, task.id));
  if (existingWork) {
    await database.update(dailyWorkTable).set(taskToDailyWorkValues(task)).where(eq(dailyWorkTable.id, existingWork.id));
  } else {
    await database.insert(dailyWorkTable).values(taskToDailyWorkValues(task));
  }
}

async function backfillDailyWorkFromTasks() {
  const [tasks, dailyWork] = await Promise.all([
    db.select().from(internalTasksTable),
    db.select().from(dailyWorkTable),
  ]);
  let linked = 0;
  for (const task of tasks) {
    if (!task.userId) continue;
    // Skip the legacy Task copy that was created from an existing Daily Work record.
    const isLegacyDailyWorkTask = dailyWork.some((work) =>
      task.taskCode === `TASK-${work.id}` && work.userId === task.userId && work.action === task.taskName,
    );
    if (isLegacyDailyWorkTask) continue;
    const hasLinkedWork = dailyWork.some((work) => work.sourceTaskId === task.id);
    if (!hasLinkedWork) {
      await syncDailyWorkFromTask(db, task);
      linked += 1;
    }
  }
  return linked;
}

async function enrichTask(task: typeof internalTasksTable.$inferSelect) {
  let userName: string | null = null;
  let teamName: string | null = null;

  if (task.userId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, task.userId));
    userName = user?.name ?? null;
  }
  if (task.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, task.teamId));
    teamName = team?.name ?? null;
  }

  return {
    id: task.id,
    taskCode: task.taskCode,
    taskName: task.taskName,
    how: task.how,
    who: task.who,
    assignedBy: task.assignedBy,
    priority: task.priority,
    plannedStartDate: task.plannedStartDate,
    plannedEndDate: task.plannedEndDate,
    actualStartDate: task.actualStartDate,
    actualEndDate: task.actualEndDate,
    status: task.status,
    completionPct: task.completionPct,
    dependency: task.dependency,
    remarks: task.remarks,
    etc: task.etc,
    userId: task.userId,
    teamId: task.teamId,
    approvalStatus: task.approvalStatus,
    approvedBy: task.approvedBy,
    approvedAt: task.approvedAt?.toISOString(),
    rejectionReason: task.rejectionReason,
    assignmentStatus: task.assignmentStatus,
    assignedAt: task.assignedAt?.toISOString(),
    acceptedAt: task.acceptedAt?.toISOString(),
    declinedAt: task.declinedAt?.toISOString(),
    declineReason: task.declineReason,
    userName,
    teamName,
    createdAt: task.createdAt?.toISOString(),
  };
}

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function notifyTaskChange(task: typeof internalTasksTable.$inferSelect, action: "created" | "updated" | "deleted") {
  if (!task.userId) return;

  const recipientIds = new Set<number>();
  const [assignee] = await db.select({ name: usersTable.name, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, task.userId));
  if (task.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, task.teamId));
    if (assignee?.role === "employee" && team?.tlId) recipientIds.add(team.tlId);
  }
  if (assignee?.role === "tl") {
    const itManagers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "it_manager"));
    itManagers.forEach((user) => recipientIds.add(user.id));
  }
  if (assignee?.role === "it_manager") {
    const managers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "manager"));
    managers.forEach((user) => recipientIds.add(user.id));
  }

  const actorName = assignee?.name ?? "A user";
  const title = action === "deleted" ? "Task Deleted" : action === "updated" ? "Task Updated" : "Task Created";
  const message = `${actorName} ${action} the task "${task.taskName}". The shared task list has been updated.`;
  const type = `task_${action}_${task.id}`;
  const targetDate = todayLocal();

  await Promise.all([...recipientIds]
    .filter((recipientId) => recipientId !== task.userId)
    .map((recipientId) => createPortalNotification(recipientId, task.userId!, type, title, message, targetDate)));
}

async function notifyCompletedTaskForReview(task: typeof internalTasksTable.$inferSelect) {
  if (!task.userId) return;
  const [submitter] = await db.select().from(usersTable).where(eq(usersTable.id, task.userId));
  if (!submitter) return;

  const recipients = new Set<number>();
  if (submitter.role === "employee" && task.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, task.teamId));
    if (team?.tlId) recipients.add(team.tlId);
  } else if (submitter.role === "tl") {
    const itManagers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "it_manager"));
    itManagers.forEach((manager) => recipients.add(manager.id));
  } else if (submitter.role === "it_manager") {
    const managers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "manager"));
    managers.forEach((manager) => recipients.add(manager.id));
  }

  await Promise.all([...recipients].map((recipientId) => createPortalNotification(
    recipientId,
    task.userId!,
    `task_review_${task.id}`,
    "Completed Task Awaiting Approval",
    `${submitter.name} completed the task "${task.taskName}". Please review it.`,
    todayLocal(),
  )));
}

async function notifyTaskDecision(task: typeof internalTasksTable.$inferSelect, approved: boolean, approverId: number | null) {
  if (!task.userId) return;
  const [approver] = approverId ? await db.select().from(usersTable).where(eq(usersTable.id, approverId)) : [undefined];
  const decision = approved ? "approved" : "rejected";
  const employeeMessage = approved
    ? `Your completed task "${task.taskName}" was approved by ${approver?.name ?? "your reviewer"}.`
    : `Your completed task "${task.taskName}" was rejected by ${approver?.name ?? "your reviewer"}. Reason: ${task.rejectionReason ?? "Please review and resubmit."}`;
  const managementMessage = `${approver?.name ?? "A reviewer"} ${decision} ${task.userId}'s task "${task.taskName}".`;
  await notifyRoleScopedEvent(
    task.userId,
    task.teamId,
    `task_${approved ? "approved" : "rejected"}_${task.id}`,
    approved ? "Task Approved" : "Task Rejected",
    { self: employeeMessage, team: managementMessage, management: managementMessage, actor: `You ${decision} the task "${task.taskName}".` },
    todayLocal(),
    task.id,
    approverId,
  );
}

router.get("/tasks/status-summary", async (req, res) => {
  const { teamId, month, year } = req.query;
  let tasks = await db.select().from(internalTasksTable);

  if (teamId) tasks = tasks.filter(t => t.teamId === parseInt(teamId as string));
  if (month) {
    tasks = tasks.filter(t => {
      if (!t.plannedStartDate) return true;
      const d = new Date(t.plannedStartDate + "T00:00:00Z");
      return d.getUTCMonth() + 1 === parseInt(month as string);
    });
  }
  if (year) {
    tasks = tasks.filter(t => {
      if (!t.plannedStartDate) return true;
      const d = new Date(t.plannedStartDate + "T00:00:00Z");
      return d.getUTCFullYear() === parseInt(year as string);
    });
  }

  const summary = {
    completed: tasks.filter(t => t.status === "completed").length,
    wip: tasks.filter(t => t.status === "wip").length,
    yts: tasks.filter(t => t.status === "yts").length,
    hold: tasks.filter(t => t.status === "hold").length,
    cancelled: tasks.filter(t => t.status === "cancelled").length,
    total: tasks.length,
  };

  res.json(summary);
});

// One-time repair for tasks created before Task-to-Daily-Work synchronization was added.
router.post("/tasks/sync-daily-work", async (_req, res) => {
  res.json({ linked: await backfillDailyWorkFromTasks() });
});

router.get("/tasks", async (req, res) => {
  const { status, userId, teamId, tlId, month, year, priority, assignedBy, userRole, assignmentStatus } = req.query;
  let tasks = await db.select().from(internalTasksTable);

  if (status) tasks = tasks.filter(t => t.status === status);
  if (userId) tasks = tasks.filter(t => t.userId === parseInt(userId as string));
  
  // Filter by assignment status if provided
  if (assignmentStatus) {
    tasks = tasks.filter(t => t.assignmentStatus === assignmentStatus);
  }
  
  // Filter by specific team
  if (teamId) {
    tasks = tasks.filter(t => t.teamId === parseInt(teamId as string));
  }
  // OR filter by TL - get all teams managed by this TL
  else if (tlId) {
    const tlTeams = await db.select().from(teamsTable).where(eq(teamsTable.tlId, parseInt(tlId as string)));
    const teamIds = tlTeams.map(t => t.id);
    const employees = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "employee"));
    const employeeIds = new Set(employees.map((employee) => employee.id));
    tasks = tasks.filter(t => t.teamId && teamIds.includes(t.teamId) && t.userId && employeeIds.has(t.userId));
  }
  if (priority) tasks = tasks.filter(t => t.priority === priority);
  if (assignedBy) tasks = tasks.filter(t => t.assignedBy === assignedBy);
  if (userRole) {
    const users = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, userRole as string));
    const userIds = new Set(users.map((user) => user.id));
    tasks = tasks.filter((task) => task.userId !== null && userIds.has(task.userId));
  }
  if (month) {
    tasks = tasks.filter(t => {
      if (!t.plannedStartDate) return true;
      const d = new Date(t.plannedStartDate + "T00:00:00Z");
      return d.getUTCMonth() + 1 === parseInt(month as string);
    });
  }
  if (year) {
    tasks = tasks.filter(t => {
      if (!t.plannedStartDate) return true;
      const d = new Date(t.plannedStartDate + "T00:00:00Z");
      return d.getUTCFullYear() === parseInt(year as string);
    });
  }

  const enriched = await Promise.all(tasks.map(enrichTask));
  res.json(enriched);
});

router.post("/tasks", async (req, res) => {
  const { taskName, status, ...rest } = req.body;
  if (!taskName) return res.status(400).json({ error: "taskName required" });

  const task = await db.transaction(async (tx) => {
    const [createdTask] = await tx.insert(internalTasksTable).values({
    taskName,
    status: status ?? "yts",
    taskCode: typeof rest.taskCode === "string" && rest.taskCode.trim() === "" ? null : rest.taskCode ?? null,
    how: rest.how ?? null,
    who: rest.who ?? null,
    assignedBy: rest.assignedBy ?? null,
    priority: rest.priority ?? "medium",
    plannedStartDate: optionalDate(rest.plannedStartDate) ?? null,
    plannedEndDate: optionalDate(rest.plannedEndDate) ?? null,
    actualStartDate: optionalDate(rest.actualStartDate) ?? null,
    actualEndDate: optionalDate(rest.actualEndDate) ?? null,
    completionPct: rest.completionPct ?? 0,
    dependency: rest.dependency ?? null,
    remarks: rest.remarks ?? null,
    etc: rest.etc ?? null,
    userId: rest.userId ?? null,
    teamId: rest.teamId ?? null,
    approvalStatus: "pending",
    assignmentStatus: rest.userId ? "pending" : "accepted",
    assignedAt: rest.userId ? new Date() : null,
    }).returning();
    await syncDailyWorkFromTask(tx, createdTask);
    return createdTask;
  });

  // Create notification for assigned user if task is assigned to someone
  if (task.userId) {
    const targetDate = task.plannedStartDate || todayLocal();
    await createPortalNotification(
      task.userId,
      task.userId,
      `task_assigned_${task.id}`,
      "New Task Assigned",
      `${task.assignedBy || "Your manager"} has assigned you the task "${task.taskName}".`,
      targetDate,
      task.id
    );
  }

  await notifyTaskChange(task, "created");
  res.status(201).json(await enrichTask(task));
});

router.get("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [task] = await db.select().from(internalTasksTable).where(eq(internalTasksTable.id, id));
  if (!task) return res.status(404).json({ error: "Not found" });
  res.json(await enrichTask(task));
});

router.get("/tasks/:id/reassignments", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  const taskId = parseInt(req.params.id, 10);
  const history = await db.select().from(taskReassignmentsTable).where(eq(taskReassignmentsTable.taskId, taskId));
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const names = new Map(users.map((user) => [user.id, user.name]));
  res.json(history.map((entry) => ({ ...entry, reassignedByName: names.get(entry.reassignedByUserId), fromUserName: entry.fromUserId ? names.get(entry.fromUserId) : null, toUserName: names.get(entry.toUserId) })));
});

router.post("/tasks/:id/reassign", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  const taskId = parseInt(req.params.id, 10);
  const assigneeId = Number(req.body?.assigneeId);
  const note = typeof req.body?.note === "string" ? req.body.note.trim() || null : null;
  if (!Number.isInteger(assigneeId)) return res.status(400).json({ error: "assigneeId is required" });

  const [task, actor, assignee] = await Promise.all([
    db.select().from(internalTasksTable).where(eq(internalTasksTable.id, taskId)).then((rows) => rows[0]),
    db.select().from(usersTable).where(eq(usersTable.id, session.userId)).then((rows) => rows[0]),
    db.select().from(usersTable).where(eq(usersTable.id, assigneeId)).then((rows) => rows[0]),
  ]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (!actor || !assignee || assignee.status === "inactive") return res.status(400).json({ error: "Choose an active assignee" });
  if (task.userId === assignee.id) return res.status(400).json({ error: "Task is already assigned to this user" });
  if (!(await canReassignTask(actor.id, actor.role, task, assignee))) return res.status(403).json({ error: "You do not have permission to reassign this task" });

  const [updated] = await db.transaction(async (tx) => {
    await tx.insert(taskReassignmentsTable).values({ taskId, reassignedByUserId: actor.id, fromUserId: task.userId, toUserId: assignee.id, fromTeamId: task.teamId, toTeamId: assignee.teamId, note });
    return tx.update(internalTasksTable).set({ userId: assignee.id, teamId: assignee.teamId, assignedBy: actor.name, status: "yts", completionPct: 0, approvalStatus: "pending", approvedBy: null, approvedAt: null, rejectionReason: null, assignmentStatus: "pending", assignedAt: new Date(), acceptedAt: null, declinedAt: null, declineReason: null }).where(eq(internalTasksTable.id, taskId)).returning();
  });
  await syncDailyWorkFromTask(db, updated);
  const targetDate = todayLocal();
  await Promise.all([
    createPortalNotification(assignee.id, assignee.id, `task_assigned_${task.id}_${Date.now()}`, "New Task Assigned", `${actor.name} assigned you the task "${task.taskName}".`, targetDate, task.id),
    createPortalNotification(actor.id, assignee.id, `task_reassigned_${task.id}_${Date.now()}`, "Task Assigned", `You assigned "${task.taskName}" to ${assignee.name}.`, targetDate, task.id),
  ]);
  res.json(await enrichTask(updated));
});

router.patch("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updates: Partial<typeof internalTasksTable.$inferInsert> = {};
  const fields = ["taskCode", "taskName", "how", "who", "assignedBy", "priority", "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate", "status", "completionPct", "dependency", "remarks", "etc", "userId", "teamId"];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      (updates as any)[f] = ["plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate"].includes(f)
        ? optionalDate(req.body[f])
        : f === "taskCode" && typeof req.body[f] === "string" && req.body[f].trim() === ""
          ? null
          : req.body[f];
    }
  }
  // Editing a rejected item is the employee's resubmission, matching the EOD flow.
  const [currentTask] = await db.select().from(internalTasksTable).where(eq(internalTasksTable.id, id));
  if (currentTask?.approvalStatus === "rejected") {
    updates.approvalStatus = "resubmitted";
    updates.approvedBy = null;
    updates.approvedAt = null;
    updates.rejectionReason = null;
  }
  const task = await db.transaction(async (tx) => {
    const [updatedTask] = await tx.update(internalTasksTable).set(updates).where(eq(internalTasksTable.id, id)).returning();
    if (updatedTask) await syncDailyWorkFromTask(tx, updatedTask);
    return updatedTask;
  });
  if (!task) return res.status(404).json({ error: "Not found" });
  await notifyTaskChange(task, "updated");
  if (task.status === "completed" && currentTask?.status !== "completed") await notifyCompletedTaskForReview(task);
  res.json(await enrichTask(task));
});

router.post("/tasks/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id);
  const [currentTask] = await db.select().from(internalTasksTable).where(eq(internalTasksTable.id, id));
  if (!currentTask) return res.status(404).json({ error: "Not found" });
  if (currentTask.status !== "completed") return res.status(400).json({ error: "Only completed tasks can be approved or rejected" });
  const [task] = await db.update(internalTasksTable).set({
    approvalStatus: "approved",
    approvedBy: req.body.approvedBy ?? null,
    approvedAt: new Date(),
    rejectionReason: null,
  }).where(eq(internalTasksTable.id, id)).returning();
  if (!task) return res.status(404).json({ error: "Not found" });
  await notifyTaskDecision(task, true, req.body.approvedBy ?? null);
  res.json(await enrichTask(task));
});

router.post("/tasks/:id/accept", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  
  const id = parseInt(req.params.id);
  const [currentTask] = await db.select().from(internalTasksTable).where(eq(internalTasksTable.id, id));
  if (!currentTask) return res.status(404).json({ error: "Task not found" });
  
  // Debug logging
  console.log('Accept task request:', {
    taskId: id,
    taskUserId: currentTask.userId,
    sessionUserId: session.userId,
    taskAssignedTo: currentTask.who,
    match: currentTask.userId === session.userId
  });
  
  // Only the assigned user can accept
  if (currentTask.userId !== session.userId) {
    return res.status(403).json({ 
      error: "Only the assigned user can accept this task",
      debug: {
        taskAssignedToUserId: currentTask.userId,
        yourUserId: session.userId,
        taskAssignedToName: currentTask.who
      }
    });
  }
  
  if (currentTask.assignmentStatus === "accepted") {
    return res.status(400).json({ error: "Task already accepted" });
  }
  
  const [task] = await db.update(internalTasksTable).set({
    assignmentStatus: "accepted",
    acceptedAt: new Date(),
  }).where(eq(internalTasksTable.id, id)).returning();
  
  if (!task) return res.status(404).json({ error: "Not found" });
  
  // Mark the task assignment notification as read
  await db.update(portalNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(portalNotificationsTable.recipientUserId, session.userId),
      eq(portalNotificationsTable.type, `task_assigned_${task.id}`)
    ));
  
  res.json(await enrichTask(task));
});

router.post("/tasks/:id/decline", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  
  const id = parseInt(req.params.id);
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  
  if (!reason) {
    return res.status(400).json({ error: "Decline reason is required" });
  }
  
  const [currentTask] = await db.select().from(internalTasksTable).where(eq(internalTasksTable.id, id));
  if (!currentTask) return res.status(404).json({ error: "Task not found" });
  
  // Only the assigned user can decline
  if (currentTask.userId !== session.userId) {
    return res.status(403).json({ error: "Only the assigned user can decline this task" });
  }
  
  if (currentTask.assignmentStatus === "declined") {
    return res.status(400).json({ error: "Task already declined" });
  }
  
  const [task] = await db.update(internalTasksTable).set({
    assignmentStatus: "declined",
    declinedAt: new Date(),
    declineReason: reason,
  }).where(eq(internalTasksTable.id, id)).returning();
  
  if (!task) return res.status(404).json({ error: "Not found" });
  
  // Mark the task assignment notification as read
  await db.update(portalNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(portalNotificationsTable.recipientUserId, session.userId),
      eq(portalNotificationsTable.type, `task_assigned_${task.id}`)
    ));
  
  // Notify the person who assigned the task
  const [assignedByUser] = await db.select().from(usersTable).where(eq(usersTable.name, task.assignedBy ?? ""));
  if (assignedByUser) {
    const targetDate = task.plannedStartDate || todayLocal();
    const [assignee] = await db.select().from(usersTable).where(eq(usersTable.id, task.userId!));
    await createPortalNotification(
      assignedByUser.id,
      task.userId!,
      `task_declined_${task.id}`,
      "Task Assignment Declined",
      `${assignee?.name || "An employee"} has declined the task "${task.taskName}". Reason: ${reason}`,
      targetDate,
      task.id
    );
  }
  
  res.json(await enrichTask(task));
});

router.post("/tasks/:id/reject", async (req, res) => {
  const id = parseInt(req.params.id);
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) return res.status(400).json({ error: "Rejection reason required" });
  const [currentTask] = await db.select().from(internalTasksTable).where(eq(internalTasksTable.id, id));
  if (!currentTask) return res.status(404).json({ error: "Not found" });
  if (currentTask.status !== "completed") return res.status(400).json({ error: "Only completed tasks can be approved or rejected" });
  const [task] = await db.update(internalTasksTable).set({
    approvalStatus: "rejected",
    approvedBy: req.body.approvedBy ?? null,
    approvedAt: new Date(),
    rejectionReason: reason,
  }).where(eq(internalTasksTable.id, id)).returning();
  if (!task) return res.status(404).json({ error: "Not found" });
  await notifyTaskDecision(task, false, req.body.approvedBy ?? null);
  res.json(await enrichTask(task));
});

router.delete("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const session = getSession(req);
  
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Get user details
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  // Get task with enriched data
  const [task] = await db.select().from(internalTasksTable).where(eq(internalTasksTable.id, id));
  if (!task) return res.status(404).json({ error: "Not found" });

  // Get task assignee name for audit log
  let taskUserName = null;
  if (task.userId) {
    const [taskUser] = await db.select().from(usersTable).where(eq(usersTable.id, task.userId));
    taskUserName = taskUser?.name;
  }

  // Permission check: Only allow deletion if:
  // 1. User is the task owner (employee can delete their own tasks)
  // 2. User is TL and task belongs to their team member
  // 3. User is IT Manager, Manager, or CEO (can delete any task)
  const canDelete = 
    task.userId === session.userId || // Own task
    ["it_manager", "manager", "ceo"].includes(user.role); // Admin roles

  if (!canDelete && user.role === "tl") {
    // TL can delete tasks of their team members
    if (task.teamId) {
      const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, task.teamId));
      if (team && team.tlId === session.userId) {
        // TL owns this team
      } else {
        return res.status(403).json({ error: "You don't have permission to delete this task" });
      }
    } else {
      return res.status(403).json({ error: "You don't have permission to delete this task" });
    }
  } else if (!canDelete) {
    return res.status(403).json({ error: "You don't have permission to delete this task" });
  }

  // Log to audit before deletion
  await logTaskDeletion(
    { ...task, userName: taskUserName },
    { id: user.id, name: user.name },
    req
  );

  // Older Daily Work records were represented by a TASK-<dailyWorkId> task.
  // Deleting that task must remove the matching Daily Work row as well.
  const legacyMatch = /^TASK-(\d+)$/.exec(task.taskCode ?? "");
  const [legacyWork] = legacyMatch
    ? await db.select().from(dailyWorkTable).where(eq(dailyWorkTable.id, parseInt(legacyMatch[1], 10)))
    : [undefined];
  const shouldDeleteLegacyWork = !!legacyWork && legacyWork.userId === task.userId && legacyWork.action === task.taskName;
  await db.transaction(async (tx) => {
    await tx.delete(dailyWorkTable).where(eq(dailyWorkTable.sourceTaskId, id));
    if (shouldDeleteLegacyWork && legacyWork) await tx.delete(dailyWorkTable).where(eq(dailyWorkTable.id, legacyWork.id));
    await tx.delete(internalTasksTable).where(eq(internalTasksTable.id, id));
  });
  await notifyTaskChange(task, "deleted");
  res.status(204).send();
});

// Import endpoint for bulk task upload
router.post("/tasks/import", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Parse Excel/CSV file
    const rawData = parseExcelFile(req.file.buffer);
    
    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ error: "File is empty or invalid" });
    }

    // Define header mappings (handles different column name variations)
    const headerMapping = {
      taskName: ['Task Name', 'taskName', 'task_name', 'name', 'Task', 'Tasks', 'Task Description', 'Task Details', 'Activity', 'Activity Name', 'Action', 'Work', 'Work Details', 'Task / Activity', 'Task/Activity', 'Description', 'Particulars'],
      taskCode: ['Task Code', 'taskCode', 'task_code', 'code', 'Task ID', 'Task No', 'S N', 'S.No', 'S.No.', 'Sl No', 'Serial No'],
      status: ['Status', 'status'],
      priority: ['Priority', 'priority'],
      how: ['How', 'how', 'methodology', 'method'],
      who: ['Who', 'who', 'assignee', 'assigned_to'],
      assignedBy: ['Assigned By', 'assignedBy', 'assigned_by', 'assigner'],
      plannedStartDate: ['Planned Start Date', 'Plan S Date', 'plannedStartDate', 'planned_start_date', 'start_date', 'Start Date', 'Start'],
      plannedEndDate: ['Planned End Date', 'Plan E Date', 'plannedEndDate', 'planned_end_date', 'end_date', 'End Date', 'Due Date', 'Target Date', 'End'],
      actualStartDate: ['Actual Start Date', 'Actual S Date', 'actualStartDate', 'actual_start_date'],
      actualEndDate: ['Actual End Date', 'Actual E Date', 'actualEndDate', 'actual_end_date'],
      completionPct: ['Completion %', 'Comp %', 'Progress %', 'completionPct', 'completion_pct', 'progress'],
      dependency: ['Dependency', 'dependency', 'dependencies'],
      remarks: ['Remarks', 'remarks', 'notes', 'comments'],
      etc: ['ETC', 'etc', 'estimate'],
    };

    // Map headers for each row
    const mappedData = rawData.map(row => mapHeaders(row, headerMapping));

    // Pre-filter: Remove rows without task name (required field)
    const dataWithTaskNames = mappedData.filter(row => {
      const taskName = row.taskName;
      return taskName && typeof taskName === 'string' && taskName.trim().length > 0;
    });

    if (dataWithTaskNames.length === 0) {
      return res.status(400).json({ 
        error: "No valid tasks found", 
        message: "All rows are missing task names. Please ensure your file has a 'Task Name' column with values." 
      });
    }

    if (dataWithTaskNames.length < mappedData.length) {
      console.log(`Filtered out ${mappedData.length - dataWithTaskNames.length} rows without task names`);
    }

    // Define validation schema with more helpful error messages
    const taskImportSchema = z.object({
      taskName: z.string()
        .min(1, "Task name is required")
        .refine(val => val && val.trim().length > 0, "Task name cannot be empty"),
      taskCode: z.string().optional(),
      status: z.string().optional().transform(val => {
        // Convert to lowercase and handle common variations
        if (!val) return 'yts';
        const normalized = val.toLowerCase().trim();
        const statusMap: Record<string, string> = {
          'yts': 'yts',
          'yet to start': 'yts',
          'not started': 'yts',
          'wip': 'wip',
          'work in progress': 'wip',
          'in progress': 'wip',
          'completed': 'completed',
          'complete': 'completed',
          'done': 'completed',
          'hold': 'hold',
          'holding': 'hold',
          'on hold': 'hold',
          'cancelled': 'cancelled',
          'canceled': 'cancelled',
          'cancel': 'cancelled',
        };
        return statusMap[normalized] || 'yts';
      }).pipe(z.enum(['yts', 'wip', 'completed', 'hold', 'cancelled'])),
      priority: z.string().optional().transform(val => {
        // Convert to lowercase and handle common variations
        if (!val) return 'medium';
        const normalized = val.toLowerCase().trim();
        const priorityMap: Record<string, string> = {
          'low': 'low',
          'l': 'low',
          'medium': 'medium',
          'med': 'medium',
          'm': 'medium',
          'high': 'high',
          'h': 'high',
        };
        return priorityMap[normalized] || 'medium';
      }).pipe(z.enum(['low', 'medium', 'high'])),
      how: z.string().optional(),
      who: z.string().optional(),
      assignedBy: z.string().optional(),
      plannedStartDate: z.string().optional().transform(val => excelDateToString(val)),
      plannedEndDate: z.string().optional().transform(val => excelDateToString(val)),
      actualStartDate: z.string().optional().transform(val => excelDateToString(val)),
      actualEndDate: z.string().optional().transform(val => excelDateToString(val)),
      completionPct: z.preprocess(normalizePercentage, z.coerce.number().min(0).max(100)).default(0),
      dependency: z.string().optional(),
      remarks: z.string().optional(),
      etc: z.string().optional(),
    });

    // Validate data
    const validationResult = validateImportData(dataWithTaskNames, taskImportSchema);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.errors,
        summary: {
          totalRows: validationResult.totalRows,
          validRows: validationResult.validRows,
          invalidRows: validationResult.invalidRows
        }
      });
    }

    // Employee imports must always belong to the importing account. The
    // submitted values support authorized assignment flows, while the session
    // fallback prevents an imported file from becoming unassigned.
    const session = getSession(req);
    const userId = req.body.userId ? parseInt(req.body.userId) : session?.userId ?? null;
    const teamId = req.body.teamId ? parseInt(req.body.teamId) : null;

    // Insert valid records
    const insertedTasks = await db.transaction(async (tx) => {
      const results = [];
      for (const record of validationResult.validRecords) {
        const [task] = await tx.insert(internalTasksTable).values({
          ...record,
          userId: userId,
          teamId: teamId,
          approvalStatus: 'pending',
          // An import made from a user's own portal is already accepted by
          // that user. Otherwise the record would be hidden by My Tasks,
          // which intentionally displays accepted assignments only.
          assignmentStatus: 'accepted',
          assignedAt: userId ? new Date() : null,
        }).returning();
        
        // Sync to daily work
        await syncDailyWorkFromTask(tx, task);
        results.push(task);
      }
      return results;
    });

    // Enrich and return results
    const enrichedTasks = await Promise.all(insertedTasks.map(enrichTask));

    res.json({
      success: true,
      imported: enrichedTasks.length,
      tasks: enrichedTasks,
      summary: {
        totalRows: validationResult.totalRows,
        successfulImports: enrichedTasks.length,
        failedImports: 0
      }
    });

  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ 
      error: "Import failed", 
      message: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

export default router;

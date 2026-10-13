import { Router } from "express";
import { db, trainingRecordsTable, usersTable, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { notifyEmployeeRecordDeleted } from "./notifications";
import { sessions } from "./auth";
import multer from "multer";
import { z } from "zod";
import { parseExcelFile, validateImportData, excelDateToString, mapHeaders, normalizePercentage } from "../lib/import-helper";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function getSession(req: import("express").Request) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? sessions.get(authHeader.slice(7)) : undefined;
}

async function enrichTraining(record: typeof trainingRecordsTable.$inferSelect) {
  let userName: string | null = null;
  let teamName: string | null = null;

  if (record.userId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, record.userId));
    userName = user?.name ?? null;
  }
  if (record.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, record.teamId));
    teamName = team?.name ?? null;
  }

  return {
    id: record.id,
    topic: record.topic,
    category: record.category,
    trainer: record.trainer,
    startDate: record.startDate,
    endDate: record.endDate,
    status: record.status,
    progressPct: record.progressPct,
    remarks: record.remarks,
    userId: record.userId,
    teamId: record.teamId,
    userName,
    teamName,
    createdAt: record.createdAt?.toISOString(),
  };
}

router.get("/training", async (req, res) => {
  const { userId, teamId, tlId, status, month, year, trainer, topic, userRole } = req.query;
  let records = await db.select().from(trainingRecordsTable);

  if (userId) records = records.filter(r => r.userId === parseInt(userId as string));
  
  // Filter by specific team
  if (teamId) {
    records = records.filter(r => r.teamId === parseInt(teamId as string));
  }
  // OR filter by TL - get all teams managed by this TL
  else if (tlId) {
    const tlTeams = await db.select().from(teamsTable).where(eq(teamsTable.tlId, parseInt(tlId as string)));
    const teamIds = tlTeams.map(t => t.id);
    const employees = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "employee"));
    const employeeIds = new Set(employees.map((employee) => employee.id));
    records = records.filter(r => r.teamId && teamIds.includes(r.teamId) && r.userId && employeeIds.has(r.userId));
  }
  if (status) records = records.filter(r => r.status === status);
  if (trainer) records = records.filter(r => r.trainer?.toLowerCase().includes((trainer as string).toLowerCase()));
  if (topic) records = records.filter(r => r.topic?.toLowerCase().includes((topic as string).toLowerCase()));
  if (userRole) {
    const users = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, userRole as string));
    const userIds = new Set(users.map((user) => user.id));
    records = records.filter((record) => record.userId !== null && userIds.has(record.userId));
  }
  if (month) {
    records = records.filter(r => {
      if (!r.startDate) return true;
      const d = new Date(r.startDate + "T00:00:00Z");
      return d.getUTCMonth() + 1 === parseInt(month as string);
    });
  }
  if (year) {
    records = records.filter(r => {
      if (!r.startDate) return true;
      const d = new Date(r.startDate + "T00:00:00Z");
      return d.getUTCFullYear() === parseInt(year as string);
    });
  }

  const enriched = await Promise.all(records.map(enrichTraining));
  res.json(enriched);
});

router.post("/training", async (req, res) => {
  const { topic, status, ...rest } = req.body;
  if (!topic) return res.status(400).json({ error: "topic required" });

  const [record] = await db.insert(trainingRecordsTable).values({
    topic,
    status: status ?? "yts",
    category: rest.category ?? null,
    trainer: rest.trainer ?? null,
    startDate: rest.startDate ?? null,
    endDate: rest.endDate ?? null,
    progressPct: rest.progressPct ?? 0,
    remarks: rest.remarks ?? null,
    userId: rest.userId ?? null,
    teamId: rest.teamId ?? null,
  }).returning();

  res.status(201).json(await enrichTraining(record));
});

router.get("/training/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [record] = await db.select().from(trainingRecordsTable).where(eq(trainingRecordsTable.id, id));
  if (!record) return res.status(404).json({ error: "Not found" });
  res.json(await enrichTraining(record));
});

router.patch("/training/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updates: Partial<typeof trainingRecordsTable.$inferInsert> = {};
  const fields = ["topic", "category", "trainer", "startDate", "endDate", "status", "progressPct", "remarks"];
  for (const f of fields) {
    if (req.body[f] !== undefined) (updates as any)[f] = req.body[f];
  }
  const [record] = await db.update(trainingRecordsTable).set(updates).where(eq(trainingRecordsTable.id, id)).returning();
  if (!record) return res.status(404).json({ error: "Not found" });
  res.json(await enrichTraining(record));
});

router.delete("/training/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [record] = await db.select().from(trainingRecordsTable).where(eq(trainingRecordsTable.id, id));
  if (!record) return res.status(404).json({ error: "Not found" });
  await db.delete(trainingRecordsTable).where(eq(trainingRecordsTable.id, id));
  await notifyEmployeeRecordDeleted(record.userId, record.teamId, "Training Record", record.topic, record.id);
  res.status(204).send();
});

// Import endpoint for bulk training upload
router.post("/training/import", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Parse Excel/CSV file
    const rawData = parseExcelFile(req.file.buffer);
    
    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ error: "File is empty or invalid" });
    }

    // Define header mappings
    const headerMapping = {
      topic: ['Topic', 'Topics', 'Topics Covered', 'topic', 'training_topic', 'subject'],
      category: ['Category', 'Module', 'Sub Modules', 'category', 'type'],
      trainer: ['Trainer', 'Trainer Remarks', 'trainer', 'instructor', 'facilitator'],
      startDate: ['Start Date', 'startDate', 'start_date', 'begin_date'],
      endDate: ['End Date', 'endDate', 'end_date', 'completion_date'],
      status: ['Status', 'status'],
      progressPct: ['Progress %', 'Trainee Assignment Status', 'progressPct', 'progress_pct', 'progress', 'completion'],
      remarks: ['Remarks', 'Trainer Remarks', 'remarks', 'notes', 'comments'],
    };

    // Map headers for each row
    const mappedData = rawData.map(row => mapHeaders(row, headerMapping));

    // Pre-filter: Remove rows without topic (required field)
    const dataWithTopics = mappedData.filter(row => {
      const topic = row.topic;
      return topic && typeof topic === 'string' && topic.trim().length > 0;
    });

    if (dataWithTopics.length === 0) {
      return res.status(400).json({ 
        error: "No valid training records found", 
        message: "All rows are missing topics. Please ensure your file has a 'Topic' column with values." 
      });
    }

    if (dataWithTopics.length < mappedData.length) {
      console.log(`Filtered out ${mappedData.length - dataWithTopics.length} rows without topics`);
    }

    // Define validation schema
    const trainingImportSchema = z.object({
      topic: z.string().min(1, "Topic is required"),
      category: z.string().optional(),
      trainer: z.string().optional(),
      startDate: z.string().optional().transform(val => excelDateToString(val)),
      endDate: z.string().optional().transform(val => excelDateToString(val)),
      status: z.string().optional().transform(val => {
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
        };
        return statusMap[normalized] || 'yts';
      }).pipe(z.enum(['yts', 'wip', 'completed'])),
      progressPct: z.preprocess(normalizePercentage, z.coerce.number().min(0).max(100)).default(0),
      remarks: z.string().optional(),
    });

    // Validate data
    const validationResult = validateImportData(dataWithTopics, trainingImportSchema);

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

    // Use the importing account when an explicit employee is not supplied so
    // the imported record is visible in that person's own Training page.
    const session = getSession(req);
    const userId = req.body.userId ? parseInt(req.body.userId) : session?.userId ?? null;
    const teamId = req.body.teamId ? parseInt(req.body.teamId) : null;

    // Insert valid records
    const insertedRecords = await db.transaction(async (tx) => {
      const results = [];
      for (const record of validationResult.validRecords) {
        const [training] = await tx.insert(trainingRecordsTable).values({
          ...record,
          userId: userId,
          teamId: teamId,
        }).returning();
        results.push(training);
      }
      return results;
    });

    // Enrich and return results
    const enrichedRecords = await Promise.all(insertedRecords.map(enrichTraining));

    res.json({
      success: true,
      imported: enrichedRecords.length,
      training: enrichedRecords,
      summary: {
        totalRows: validationResult.totalRows,
        successfulImports: enrichedRecords.length,
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

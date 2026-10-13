import { Router } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sessions } from "./auth";
import { logger } from "../lib/logger";

const router = Router();

// Helper function to check if user is CEO
function requireCEO(req: any, res: any): { userId: number } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  const token = authHeader.slice(7);
  const session = sessions.get(token);

  if (!session) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }

  if (session.role !== "ceo") {
    res.status(403).json({ error: "Only CEO can access system settings" });
    return null;
  }

  return { userId: session.userId };
}

// Get global email setting
router.get("/system-settings/global-email", async (req, res) => {
  const auth = requireCEO(req, res);
  if (!auth) return;

  try {
    const [setting] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.settingKey, "global_email_enabled"));

    if (!setting) {
      return res.json({ globalEmailEnabled: true }); // Default to enabled
    }

    res.json({
      globalEmailEnabled: setting.settingValue === "true",
      updatedAt: setting.updatedAt,
    });
  } catch (error) {
    logger.error({ error }, "Failed to fetch global email setting");
    res.status(500).json({ error: "Failed to fetch setting" });
  }
});

// Update global email setting
router.patch("/system-settings/global-email", async (req, res) => {
  const auth = requireCEO(req, res);
  if (!auth) return;

  const { globalEmailEnabled } = req.body;

  if (typeof globalEmailEnabled !== "boolean") {
    return res.status(400).json({ error: "globalEmailEnabled must be a boolean" });
  }

  try {
    await db
      .update(systemSettingsTable)
      .set({
        settingValue: globalEmailEnabled ? "true" : "false",
        updatedBy: auth.userId,
        updatedAt: new Date(),
      })
      .where(eq(systemSettingsTable.settingKey, "global_email_enabled"));

    logger.info(
      { userId: auth.userId, globalEmailEnabled },
      "CEO updated global email setting"
    );

    res.json({ success: true, globalEmailEnabled });
  } catch (error) {
    logger.error({ error }, "Failed to update global email setting");
    res.status(500).json({ error: "Failed to update setting" });
  }
});

export default router;

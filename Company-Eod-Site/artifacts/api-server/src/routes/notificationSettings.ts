import { Router } from "express";
import { db, notificationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sessions } from "./auth";

const router = Router();

function getSession(req: import("express").Request) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? sessions.get(authHeader.slice(7)) : undefined;
}

// Get current user's notification settings
router.get("/notification-settings", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  try {
    let [settings] = await db
      .select()
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.userId, session.userId));

    // If no settings exist, create default ones
    if (!settings) {
      [settings] = await db
        .insert(notificationSettingsTable)
        .values({
          userId: session.userId,
          portalNotificationsEnabled: true,
          emailAlertsEnabled: true,
        })
        .returning();
    }

    res.json({
      portalNotificationsEnabled: settings.portalNotificationsEnabled,
      emailAlertsEnabled: settings.emailAlertsEnabled,
      updatedAt: settings.updatedAt?.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching notification settings:", error);
    res.status(500).json({ error: "Failed to fetch notification settings" });
  }
});

// Update notification settings
router.patch("/notification-settings", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const { portalNotificationsEnabled, emailAlertsEnabled } = req.body;

  try {
    // Check if settings exist
    const [existing] = await db
      .select()
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.userId, session.userId));

    let settings;

    if (existing) {
      // Update existing settings
      const updates: any = { updatedAt: new Date() };
      
      if (typeof portalNotificationsEnabled === "boolean") {
        updates.portalNotificationsEnabled = portalNotificationsEnabled;
      }
      
      if (typeof emailAlertsEnabled === "boolean") {
        updates.emailAlertsEnabled = emailAlertsEnabled;
      }

      [settings] = await db
        .update(notificationSettingsTable)
        .set(updates)
        .where(eq(notificationSettingsTable.userId, session.userId))
        .returning();
    } else {
      // Create new settings
      [settings] = await db
        .insert(notificationSettingsTable)
        .values({
          userId: session.userId,
          portalNotificationsEnabled: portalNotificationsEnabled ?? true,
          emailAlertsEnabled: emailAlertsEnabled ?? true,
        })
        .returning();
    }

    res.json({
      portalNotificationsEnabled: settings.portalNotificationsEnabled,
      emailAlertsEnabled: settings.emailAlertsEnabled,
      updatedAt: settings.updatedAt?.toISOString(),
    });
  } catch (error) {
    console.error("Error updating notification settings:", error);
    res.status(500).json({ error: "Failed to update notification settings" });
  }
});

// Helper function to check if email alerts are enabled for a user
export async function areEmailAlertsEnabled(userId: number): Promise<boolean> {
  try {
    const [settings] = await db
      .select()
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.userId, userId));

    return settings?.emailAlertsEnabled ?? true; // Default to true if no settings
  } catch (error) {
    console.error("Error checking email alert settings:", error);
    return true; // Default to enabled on error
  }
}

// Helper function to check if portal notifications are enabled for a user
export async function arePortalNotificationsEnabled(userId: number): Promise<boolean> {
  try {
    const [settings] = await db
      .select()
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.userId, userId));

    return settings?.portalNotificationsEnabled ?? true; // Default to true if no settings
  } catch (error) {
    console.error("Error checking portal notification settings:", error);
    return true; // Default to enabled on error
  }
}

export default router;

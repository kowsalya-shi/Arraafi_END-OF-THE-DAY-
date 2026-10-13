import { date, integer, pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const portalNotificationsTable = pgTable("portal_notifications", {
  id: serial("id").primaryKey(),
  recipientUserId: integer("recipient_user_id").notNull(),
  recipientRole: text("recipient_role").notNull(),
  employeeId: integer("employee_id").notNull(),
  relatedTaskId: integer("related_task_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  targetDate: date("target_date").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationSettingsTable = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  portalNotificationsEnabled: boolean("portal_notifications_enabled").notNull().default(true),
  emailAlertsEnabled: boolean("email_alerts_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

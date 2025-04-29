import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Discord status configuration
export const discordStatus = pgTable("discord_status", {
  id: serial("id").primaryKey(),
  token: text("token"),
  channelId: text("channel_id"),
  statusMode: text("status_mode").default("online"),
  isAccountActive: boolean("is_account_active").default(true),
  isVoiceActive: boolean("is_voice_active").default(true),
  autoReconnect: boolean("auto_reconnect").default(true),
  systemNotifications: boolean("system_notifications").default(true),
  autoStart: boolean("auto_start").default(false),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const insertDiscordStatusSchema = createInsertSchema(discordStatus).pick({
  token: true,
  channelId: true,
  statusMode: true,
  isAccountActive: true,
  isVoiceActive: true,
  autoReconnect: true,
  systemNotifications: true,
  autoStart: true,
});

export type InsertDiscordStatus = z.infer<typeof insertDiscordStatusSchema>;
export type DiscordStatus = typeof discordStatus.$inferSelect;

// Activity logs
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "system", "status", "warning", "error"
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).pick({
  type: true,
  message: true,
});

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Discord status updates (for real-time data)
export const statusUpdateSchema = z.object({
  connectionStatus: z.enum(["connected", "connecting", "disconnected", "error"]),
  statusMode: z.enum(["online", "idle", "dnd", "invisible"]),
  isAccountActive: z.boolean(),
  isVoiceActive: z.boolean(),
  autoReconnect: z.boolean(),
  voiceStatus: z.enum(["connected", "connecting", "disconnected", "error"]),
  connectedChannel: z.string().nullable(),
  activeSince: z.string(),
  connectionDuration: z.string().nullable(),
  uptime: z.string(),
  error: z.string().optional(), // Add support for error messages
});

export type StatusUpdate = z.infer<typeof statusUpdateSchema>;

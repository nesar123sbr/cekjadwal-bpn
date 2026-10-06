import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  file_number: text("file_number").notNull(),
  file_number_normalized: text("file_number_normalized").notNull().unique(),
  applicant_name: text("applicant_name").notNull(),
  object_address: text("object_address").notNull(),
  status: text("status").notNull().default("BELUM_DIJADWALKAN"),
});

export const officers = sqliteTable("officers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: text("position").notNull(),
});

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  application_id: text("application_id")
    .notNull()
    .references(() => applications.id),
  inspection_date: text("inspection_date").notNull(),
  inspection_time: text("inspection_time").notNull(),
  status: text("status").notNull().default("AKTIF"),
  notes_for_public: text("notes_for_public"),
});

export const schedule_officers = sqliteTable("schedule_officers", {
  id: text("id").primaryKey(),
  schedule_id: text("schedule_id")
    .notNull()
    .references(() => schedules.id),
  officer_id: text("officer_id")
    .notNull()
    .references(() => officers.id),
  role_in_team: text("role_in_team"),
});

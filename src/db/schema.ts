import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const APPLICATION_STATUSES = [
  "MENUNGGU_DOKUMEN",
  "VERIFIKASI_PETUGAS",
  "DIJADWALKAN",
  "SELESAI",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

const nowIso = () => new Date().toISOString();

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  ticket_number: text("ticket_number").notNull(),
  ticket_number_normalized: text("ticket_number_normalized").notNull().unique(),
  applicant_name: text("applicant_name").notNull(),
  object_address: text("object_address").notNull(),
  status: text("status", { enum: APPLICATION_STATUSES })
    .notNull()
    .default("VERIFIKASI_PETUGAS"),
  missing_documents: text("missing_documents"),
  official_file_number: text("official_file_number"),
  /** ISO timestamp berkas diterima; dasar perhitungan lama proses. */
  created_at: text("created_at").notNull().$defaultFn(nowIso),
  /** ISO timestamp terakhir status berubah; dasar lama di tahap saat ini. */
  status_updated_at: text("status_updated_at").notNull().$defaultFn(nowIso),
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

import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const APPLICATION_STATUSES = [
  "MENUNGGU_DOKUMEN",
  "VERIFIKASI_PETUGAS",
  "DIJADWALKAN",
  "SELESAI",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

const nowIso = () => new Date().toISOString();

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    ticket_number: text("ticket_number").notNull(),
    ticket_number_normalized: text("ticket_number_normalized").notNull(),
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
    /** ISO timestamp soft-delete (null jika berkas aktif). */
    deleted_at: text("deleted_at"),
  },
  (table) => [
    index("idx_applications_ticket_normalized").on(table.ticket_number_normalized),
    index("idx_applications_status").on(table.status),
  ],
);

export const application_visits = sqliteTable(
  "application_visits",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id),
    visit_date: text("visit_date").notNull(),
    notes: text("notes"),
    created_at: text("created_at").notNull().$defaultFn(nowIso),
  },
  (table) => [
    index("idx_application_visits_application_id").on(table.application_id),
  ],
);

export const officers = sqliteTable("officers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: text("position").notNull(),
  deleted_at: text("deleted_at"),
});

export const schedules = sqliteTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id),
    inspection_date: text("inspection_date").notNull(),
    inspection_time: text("inspection_time").notNull(),
    status: text("status").notNull().default("AKTIF"),
    notes_for_public: text("notes_for_public"),
    cancel_reason: text("cancel_reason"),
  },
  (table) => [
    index("idx_schedules_application_id").on(table.application_id),
    index("idx_schedules_status_date").on(table.status, table.inspection_date),
  ],
);

export const schedule_officers = sqliteTable(
  "schedule_officers",
  {
    id: text("id").primaryKey(),
    schedule_id: text("schedule_id")
      .notNull()
      .references(() => schedules.id),
    officer_id: text("officer_id")
      .notNull()
      .references(() => officers.id),
    role_in_team: text("role_in_team"),
  },
  (table) => [
    index("idx_schedule_officers_schedule_id").on(table.schedule_id),
    index("idx_schedule_officers_officer_id").on(table.officer_id),
  ],
);

export const audit_logs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id"),
    action: text("action").notNull(),
    actor: text("actor"),
    old_value: text("old_value"),
    new_value: text("new_value"),
    ip: text("ip"),
    created_at: text("created_at").notNull().$defaultFn(nowIso),
  },
  (table) => [
    index("idx_audit_logs_application_id").on(table.application_id),
    index("idx_audit_logs_action_created_at").on(table.action, table.created_at),
  ],
);


"use server";

import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  applications,
  officers,
  schedule_officers,
  schedules,
} from "@/db/schema";
import { getSession } from "@/lib/session";

export type CreateScheduleInput = {
  applicationId: string;
  inspectionDate: string; // YYYY-MM-DD
  inspectionTime: string; // HH:mm
  notes: string;
  officerIds: string[];
};

export type CreateScheduleResult = { ok: true } | { ok: false; error: string };

export async function createSchedule(
  input: CreateScheduleInput,
): Promise<CreateScheduleResult> {
  if (!(await getSession())) {
    return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
  }

  const { applicationId, inspectionDate, inspectionTime } = input;
  const notes = input.notes.trim();
  const officerIds = [...new Set(input.officerIds)];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate)) {
    return { ok: false, error: "Tanggal pemeriksaan tidak valid." };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(inspectionTime)) {
    return { ok: false, error: "Jam pemeriksaan tidak valid." };
  }
  if (officerIds.length === 0) {
    return { ok: false, error: "Pilih minimal satu petugas." };
  }

  const app = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .get();
  if (!app) return { ok: false, error: "Berkas tidak ditemukan." };
  if (app.status !== "BELUM_DIJADWALKAN") {
    return { ok: false, error: "Berkas ini sudah dijadwalkan atau selesai." };
  }

  const found = await db
    .select({ id: officers.id })
    .from(officers)
    .where(inArray(officers.id, officerIds));
  if (found.length !== officerIds.length) {
    return { ok: false, error: "Petugas tidak valid." };
  }

  const scheduleId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schedules).values({
      id: scheduleId,
      application_id: applicationId,
      inspection_date: inspectionDate,
      inspection_time: inspectionTime,
      status: "AKTIF",
      notes_for_public: notes || null,
    });
    await tx.insert(schedule_officers).values(
      officerIds.map((officerId, i) => ({
        id: randomUUID(),
        schedule_id: scheduleId,
        officer_id: officerId,
        role_in_team: i === 0 ? "Ketua Tim" : "Anggota",
      })),
    );
    await tx
      .update(applications)
      .set({ status: "DIJADWALKAN" })
      .where(eq(applications.id, applicationId));
  });

  revalidatePath("/admin");
  return { ok: true };
}

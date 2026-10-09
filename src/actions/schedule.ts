"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
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
    .where(and(eq(applications.id, applicationId), isNull(applications.deleted_at)))
    .get();
  if (!app) return { ok: false, error: "Berkas tidak ditemukan." };
  if (app.status === "MENUNGGU_DOKUMEN") {
    return {
      ok: false,
      error: "Dokumen pemohon belum lengkap. Kosongkan catatan dokumen kurang terlebih dahulu.",
    };
  }
  if (app.status !== "VERIFIKASI_PETUGAS") {
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
      .set({
        status: "DIJADWALKAN",
        status_updated_at: new Date().toISOString(),
      })
      .where(eq(applications.id, applicationId));
  });

  revalidatePath("/admin");
  return { ok: true };
}

export type ScheduleActionResult = { ok: true } | { ok: false; error: string };

export async function markApplicationComplete(
  applicationId: string,
  officialFileNumber: string,
): Promise<ScheduleActionResult> {
  if (!(await getSession())) {
    return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
  }

  const app = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), isNull(applications.deleted_at)))
    .get();
  if (!app) return { ok: false, error: "Berkas tidak ditemukan." };
  if (app.status !== "DIJADWALKAN") {
    return { ok: false, error: "Hanya berkas terjadwal yang dapat diselesaikan." };
  }

  const official = officialFileNumber.trim();
  if (!official) {
    return { ok: false, error: "Nomor Berkas Resmi BPN wajib diisi." };
  }

  const duplicate = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.official_file_number, official))
    .get();
  if (duplicate && duplicate.id !== applicationId) {
    return { ok: false, error: "Nomor Berkas Resmi sudah dipakai berkas lain." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schedules)
      .set({ status: "SELESAI" })
      .where(
        and(
          eq(schedules.application_id, applicationId),
          eq(schedules.status, "AKTIF"),
        ),
      );
    await tx
      .update(applications)
      .set({
        status: "SELESAI",
        official_file_number: official,
        status_updated_at: new Date().toISOString(),
      })
      .where(eq(applications.id, applicationId));
  });

  revalidatePath("/admin");
  return { ok: true };
}

/** Memperbarui jadwal AKTIF (tanggal, jam, catatan, dan tim petugas). */
export async function updateSchedule(
  input: CreateScheduleInput,
): Promise<ScheduleActionResult> {
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

  const schedule = await db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.application_id, applicationId),
        eq(schedules.status, "AKTIF"),
      ),
    )
    .get();
  if (!schedule) return { ok: false, error: "Jadwal aktif tidak ditemukan." };

  const found = await db
    .select({ id: officers.id })
    .from(officers)
    .where(inArray(officers.id, officerIds));
  if (found.length !== officerIds.length) {
    return { ok: false, error: "Petugas tidak valid." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schedules)
      .set({
        inspection_date: inspectionDate,
        inspection_time: inspectionTime,
        notes_for_public: notes || null,
      })
      .where(eq(schedules.id, schedule.id));
    await tx
      .delete(schedule_officers)
      .where(eq(schedule_officers.schedule_id, schedule.id));
    await tx.insert(schedule_officers).values(
      officerIds.map((officerId, i) => ({
        id: randomUUID(),
        schedule_id: schedule.id,
        officer_id: officerId,
        role_in_team: i === 0 ? "Ketua Tim" : "Anggota",
      })),
    );
  });

  revalidatePath("/admin");
  return { ok: true };
}

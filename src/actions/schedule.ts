"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  applications,
  officers,
  schedule_officers,
  schedules,
} from "@/db/schema";
import { getSession } from "@/lib/session";
import { getNowWibIso } from "@/lib/utils";

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
  try {
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
      .where(and(inArray(officers.id, officerIds), isNull(officers.deleted_at)));
    if (found.length !== officerIds.length) {
      return { ok: false, error: "Petugas tidak valid." };
    }

    const conflict = await db
      .select({
        officerName: officers.name,
      })
      .from(schedule_officers)
      .innerJoin(schedules, eq(schedule_officers.schedule_id, schedules.id))
      .innerJoin(officers, eq(schedule_officers.officer_id, officers.id))
      .where(
        and(
          inArray(schedule_officers.officer_id, officerIds),
          eq(schedules.inspection_date, inspectionDate),
          eq(schedules.inspection_time, inspectionTime),
          eq(schedules.status, "AKTIF"),
        ),
      )
      .get();

    if (conflict) {
      return {
        ok: false,
        error: `Jadwal bentrok: Petugas ${conflict.officerName} sudah memiliki jadwal pemeriksaan lain pada tanggal dan jam tersebut.`,
      };
    }

    const scheduleId = randomUUID();
    const now = getNowWibIso();
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
          status_updated_at: now,
        })
        .where(eq(applications.id, applicationId));
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    console.error("createSchedule error:", err);
    return {
      ok: false,
      error: "Terjadi kendala saat menetapkan jadwal pemeriksaan. Silakan coba lagi.",
    };
  }
}

export type ScheduleActionResult = { ok: true } | { ok: false; error: string };

function validateOfficialFileNumber(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const clean = (raw ?? "").trim();
  if (!clean) {
    return { ok: false, error: "Nomor Berkas Resmi BPN wajib diisi." };
  }
  if (clean.length > 50) {
    return { ok: false, error: "Nomor Berkas Resmi BPN maksimal 50 karakter." };
  }
  return { ok: true, value: clean };
}

export async function markApplicationComplete(
  applicationId: string,
  officialFileNumber: string,
): Promise<ScheduleActionResult> {
  try {
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

    const valResult = validateOfficialFileNumber(officialFileNumber);
    if (!valResult.ok) {
      return { ok: false, error: valResult.error };
    }
    const official = valResult.value;

    const duplicate = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.official_file_number, official),
          isNull(applications.deleted_at),
        ),
      )
      .get();
    if (duplicate && duplicate.id !== applicationId) {
      return { ok: false, error: "Nomor Berkas Resmi sudah dipakai berkas lain." };
    }

    const now = getNowWibIso();
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
          status_updated_at: now,
        })
        .where(eq(applications.id, applicationId));
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    console.error("markApplicationComplete error:", err);
    return {
      ok: false,
      error: "Terjadi kendala saat menyelesaikan berkas. Silakan coba lagi.",
    };
  }
}

/** Memperbarui jadwal AKTIF (tanggal, jam, catatan, dan tim petugas). */
export async function updateSchedule(
  input: CreateScheduleInput,
): Promise<ScheduleActionResult> {
  try {
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
      .where(and(inArray(officers.id, officerIds), isNull(officers.deleted_at)));
    if (found.length !== officerIds.length) {
      return { ok: false, error: "Petugas tidak valid." };
    }

    const conflict = await db
      .select({
        officerName: officers.name,
      })
      .from(schedule_officers)
      .innerJoin(schedules, eq(schedule_officers.schedule_id, schedules.id))
      .innerJoin(officers, eq(schedule_officers.officer_id, officers.id))
      .where(
        and(
          inArray(schedule_officers.officer_id, officerIds),
          eq(schedules.inspection_date, inspectionDate),
          eq(schedules.inspection_time, inspectionTime),
          eq(schedules.status, "AKTIF"),
          ne(schedules.id, schedule.id),
        ),
      )
      .get();

    if (conflict) {
      return {
        ok: false,
        error: `Jadwal bentrok: Petugas ${conflict.officerName} sudah memiliki jadwal pemeriksaan lain pada tanggal dan jam tersebut.`,
      };
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
  } catch (err) {
    console.error("updateSchedule error:", err);
    return {
      ok: false,
      error: "Terjadi kendala saat mengubah jadwal pemeriksaan. Silakan coba lagi.",
    };
  }
}

export async function cancelSchedule(
  applicationId: string,
  reason: string,
): Promise<ScheduleActionResult> {
  try {
    if (!(await getSession())) {
      return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
    }

    const cleanReason = reason.trim();
    if (!cleanReason || cleanReason.length < 3) {
      return {
        ok: false,
        error: "Alasan pembatalan wajib diisi minimal 3 karakter.",
      };
    }

    const app = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), isNull(applications.deleted_at)),
      )
      .get();
    if (!app) return { ok: false, error: "Berkas tidak ditemukan." };
    if (app.status !== "DIJADWALKAN") {
      return {
        ok: false,
        error:
          "Hanya berkas berstatus Dijadwalkan yang dapat dibatalkan jadwalnya.",
      };
    }

    const now = getNowWibIso();
    await db.transaction(async (tx) => {
      await tx
        .update(schedules)
        .set({
          status: "DIBATALKAN",
          cancel_reason: cleanReason,
        })
        .where(
          and(
            eq(schedules.application_id, applicationId),
            eq(schedules.status, "AKTIF"),
          ),
        );

      await tx
        .update(applications)
        .set({
          status: "VERIFIKASI_PETUGAS",
          status_updated_at: now,
        })
        .where(eq(applications.id, applicationId));
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    console.error("cancelSchedule error:", err);
    return {
      ok: false,
      error: "Terjadi kendala saat membatalkan jadwal pemeriksaan. Silakan coba lagi.",
    };
  }
}

export async function updateOfficialFileNumber(
  applicationId: string,
  newNumber: string,
): Promise<ScheduleActionResult> {
  try {
    if (!(await getSession())) {
      return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
    }

    const valResult = validateOfficialFileNumber(newNumber);
    if (!valResult.ok) {
      return { ok: false, error: valResult.error };
    }
    const official = valResult.value;

    const app = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), isNull(applications.deleted_at)),
      )
      .get();
    if (!app) return { ok: false, error: "Berkas tidak ditemukan." };
    if (app.status !== "SELESAI") {
      return {
        ok: false,
        error:
          "Hanya berkas berstatus Selesai yang dapat diubah nomor berkas resminya.",
      };
    }

    const duplicate = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.official_file_number, official),
          isNull(applications.deleted_at),
        ),
      )
      .get();
    if (duplicate && duplicate.id !== applicationId) {
      return { ok: false, error: "Nomor Berkas Resmi sudah dipakai berkas lain." };
    }

    await db
      .update(applications)
      .set({ official_file_number: official })
      .where(eq(applications.id, applicationId));

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    console.error("updateOfficialFileNumber error:", err);
    return {
      ok: false,
      error: "Terjadi kendala saat mengoreksi nomor berkas resmi. Silakan coba lagi.",
    };
  }
}

export async function reopenApplication(
  applicationId: string,
): Promise<ScheduleActionResult> {
  try {
    if (!(await getSession())) {
      return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
    }

    const app = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), isNull(applications.deleted_at)),
      )
      .get();
    if (!app) return { ok: false, error: "Berkas tidak ditemukan." };
    if (app.status !== "SELESAI") {
      return {
        ok: false,
        error: "Hanya berkas berstatus Selesai yang dapat dibuka kembali.",
      };
    }

    const latestFinishedSchedule = await db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.application_id, applicationId),
          eq(schedules.status, "SELESAI"),
        ),
      )
      .orderBy(desc(schedules.inspection_date), desc(schedules.inspection_time))
      .get();

    let canRestoreSchedule = false;
    if (latestFinishedSchedule) {
      // Periksa apakah petugas pada jadwal ini masih aktif
      const assignedOfficers = await db
        .select({
          deletedAt: officers.deleted_at,
        })
        .from(schedule_officers)
        .innerJoin(officers, eq(schedule_officers.officer_id, officers.id))
        .where(eq(schedule_officers.schedule_id, latestFinishedSchedule.id));

      const hasInactiveOfficer = assignedOfficers.some((o) => o.deletedAt !== null);
      canRestoreSchedule = assignedOfficers.length > 0 && !hasInactiveOfficer;
    }

    const now = getNowWibIso();
    await db.transaction(async (tx) => {
      if (latestFinishedSchedule && canRestoreSchedule) {
        await tx
          .update(schedules)
          .set({ status: "AKTIF" })
          .where(eq(schedules.id, latestFinishedSchedule.id));

        await tx
          .update(applications)
          .set({
            status: "DIJADWALKAN",
            official_file_number: null,
            status_updated_at: now,
          })
          .where(eq(applications.id, applicationId));
      } else {
        await tx
          .update(applications)
          .set({
            status: "VERIFIKASI_PETUGAS",
            official_file_number: null,
            status_updated_at: now,
          })
          .where(eq(applications.id, applicationId));
      }
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    console.error("reopenApplication error:", err);
    return {
      ok: false,
      error: "Terjadi kendala saat membuka kembali berkas. Silakan coba lagi.",
    };
  }
}

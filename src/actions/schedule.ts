"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  applications,
  audit_logs,
  officers,
  schedule_officers,
  schedules,
} from "@/db/schema";
import { getSession } from "@/lib/session";
import {
  type CancelCategory,
  CANCEL_CATEGORY_LABEL,
  CANCEL_REASON_MIN,
  CANCEL_REASON_MAX,
  encodeCancelReason,
  getNowWibIso,
  getTodayWib,
  isCancelCategory,
} from "@/lib/utils";

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
    const actor = await getSession();
    if (!actor) {
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
    if (inspectionDate < getTodayWib()) {
      return {
        ok: false,
        error: "Tanggal pemeriksaan tidak boleh sebelum hari ini.",
      };
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

      await tx.insert(audit_logs).values({
        id: randomUUID(),
        application_id: applicationId,
        action: "CREATE_SCHEDULE",
        actor,
        old_value: null,
        new_value: `${inspectionDate} ${inspectionTime}`,
        ip: null,
        created_at: now,
      });
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
    return { ok: false, error: "Nomor Berkas wajib diisi." };
  }
  if (clean.length > 50) {
    return { ok: false, error: "Nomor Berkas maksimal 50 karakter." };
  }
  return { ok: true, value: clean };
}

export async function markApplicationComplete(
  applicationId: string,
  officialFileNumber: string,
): Promise<ScheduleActionResult> {
  try {
    const actor = await getSession();
    if (!actor) {
      return { ok: false, error: "Sesi telah berakhir. Silakan login kembali." };
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
      return { ok: false, error: "Nomor Berkas sudah dipakai berkas lain." };
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

      await tx.insert(audit_logs).values({
        id: randomUUID(),
        application_id: applicationId,
        action: "COMPLETE_APPLICATION",
        actor,
        old_value: null,
        new_value: official,
        ip: null,
        created_at: now,
      });
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
    const actor = await getSession();
    if (!actor) {
      return { ok: false, error: "Sesi telah berakhir. Silakan login kembali." };
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

    if (
      inspectionDate !== schedule.inspection_date &&
      inspectionDate < getTodayWib()
    ) {
      return {
        ok: false,
        error: "Tanggal pemeriksaan tidak boleh sebelum hari ini.",
      };
    }

    const oldOfficerRows = await db
      .select({ officer_id: schedule_officers.officer_id })
      .from(schedule_officers)
      .where(eq(schedule_officers.schedule_id, schedule.id));
    const oldOfficerIds = oldOfficerRows.map((r) => r.officer_id);

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

    const dateTimeChanged =
      schedule.inspection_date !== inspectionDate ||
      schedule.inspection_time !== inspectionTime;
    const officersChanged =
      oldOfficerIds.length !== officerIds.length ||
      oldOfficerIds.some((id, idx) => id !== officerIds[idx]);
    const isChanged = dateTimeChanged || officersChanged;

    const now = getNowWibIso();
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

      if (isChanged) {
        await tx.insert(audit_logs).values({
          id: randomUUID(),
          application_id: applicationId,
          action: "UPDATE_SCHEDULE",
          actor,
          old_value: `${schedule.inspection_date} ${schedule.inspection_time}`,
          new_value: `${inspectionDate} ${inspectionTime}${
            officersChanged ? " | petugas diganti" : ""
          }`,
          ip: null,
          created_at: now,
        });
      }
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
  category: CancelCategory = "LAINNYA",
): Promise<ScheduleActionResult> {
  try {
    const actor = await getSession();
    if (!actor) {
      return { ok: false, error: "Sesi telah berakhir. Silakan login kembali." };
    }

    if (!isCancelCategory(category)) {
      return { ok: false, error: "Kategori pembatalan tidak valid." };
    }

    const cleanReason = reason.trim();
    if (!cleanReason || cleanReason.length < CANCEL_REASON_MIN) {
      return {
        ok: false,
        error: `Alasan pembatalan wajib diisi minimal ${CANCEL_REASON_MIN} karakter.`,
      };
    }
    if (cleanReason.length > CANCEL_REASON_MAX) {
      return {
        ok: false,
        error: `Alasan pembatalan maksimal ${CANCEL_REASON_MAX} karakter.`,
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

    const activeSchedule = await db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.application_id, applicationId),
          eq(schedules.status, "AKTIF"),
        ),
      )
      .get();
    if (!activeSchedule) {
      return { ok: false, error: "Jadwal aktif tidak ditemukan." };
    }

    const encodedReason = encodeCancelReason(category, cleanReason);
    const now = getNowWibIso();
    await db.transaction(async (tx) => {
      await tx
        .update(schedules)
        .set({
          status: "DIBATALKAN",
          cancel_reason: encodedReason,
        })
        .where(eq(schedules.id, activeSchedule.id));

      await tx
        .update(applications)
        .set({
          status: "VERIFIKASI_PETUGAS",
          status_updated_at: now,
        })
        .where(eq(applications.id, applicationId));

      await tx.insert(audit_logs).values({
        id: randomUUID(),
        application_id: applicationId,
        action: "CANCEL_SCHEDULE",
        actor,
        old_value: `${activeSchedule.inspection_date} ${activeSchedule.inspection_time}`,
        new_value: `${CANCEL_CATEGORY_LABEL[category]}: ${cleanReason}`,
        ip: null,
        created_at: now,
      });
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

export type RescheduleApplicationInput = {
  applicationId: string;
  category: CancelCategory;
  reason: string;
  newDate: string;
  newTime: string;
  notes: string;
  officerIds: string[];
};

export async function rescheduleApplication(
  input: RescheduleApplicationInput,
): Promise<ScheduleActionResult> {
  try {
    const actor = await getSession();
    if (!actor) {
      return { ok: false, error: "Sesi telah berakhir. Silakan login kembali." };
    }

    const { applicationId, category, newDate, newTime } = input;
    if (!isCancelCategory(category)) {
      return { ok: false, error: "Kategori pembatalan tidak valid." };
    }
    const cleanReason = (input.reason ?? "").trim();
    const notes = (input.notes ?? "").trim();
    const officerIds = [...new Set(input.officerIds)];

    if (!cleanReason || cleanReason.length < CANCEL_REASON_MIN) {
      return {
        ok: false,
        error: `Alasan pembatalan wajib diisi minimal ${CANCEL_REASON_MIN} karakter.`,
      };
    }
    if (cleanReason.length > CANCEL_REASON_MAX) {
      return {
        ok: false,
        error: `Alasan pembatalan maksimal ${CANCEL_REASON_MAX} karakter.`,
      };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      return { ok: false, error: "Tanggal pemeriksaan tidak valid." };
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) {
      return { ok: false, error: "Jam pemeriksaan tidak valid." };
    }

    const todayWib = getTodayWib();
    if (newDate < todayWib) {
      return {
        ok: false,
        error: "Tanggal pemeriksaan baru tidak boleh sebelum hari ini.",
      };
    }

    if (officerIds.length === 0) {
      return { ok: false, error: "Pilih minimal satu petugas." };
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
        error: "Hanya berkas berstatus Dijadwalkan yang dapat dijadwalkan ulang.",
      };
    }

    const activeSchedule = await db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.application_id, applicationId),
          eq(schedules.status, "AKTIF"),
        ),
      )
      .get();
    if (!activeSchedule) {
      return { ok: false, error: "Jadwal aktif tidak ditemukan." };
    }

    if (
      activeSchedule.inspection_date === newDate &&
      activeSchedule.inspection_time === newTime
    ) {
      return {
        ok: false,
        error: "Tanggal dan jam baru sama dengan jadwal sebelumnya.",
      };
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
          eq(schedules.inspection_date, newDate),
          eq(schedules.inspection_time, newTime),
          eq(schedules.status, "AKTIF"),
          ne(schedules.id, activeSchedule.id),
        ),
      )
      .get();

    if (conflict) {
      return {
        ok: false,
        error: `Jadwal bentrok: Petugas ${conflict.officerName} sudah memiliki jadwal pemeriksaan lain pada tanggal dan jam tersebut.`,
      };
    }

    const newScheduleId = randomUUID();
    const encodedReason = encodeCancelReason(category, cleanReason);
    const now = getNowWibIso();

    await db.transaction(async (tx) => {
      // (1) jadwal lama -> status DIBATALKAN dan cancel_reason = encodeCancelReason(category, reason)
      await tx
        .update(schedules)
        .set({
          status: "DIBATALKAN",
          cancel_reason: encodedReason,
        })
        .where(eq(schedules.id, activeSchedule.id));

      // (2) insert jadwal baru status AKTIF
      await tx.insert(schedules).values({
        id: newScheduleId,
        application_id: applicationId,
        inspection_date: newDate,
        inspection_time: newTime,
        status: "AKTIF",
        notes_for_public: notes || null,
      });

      // (3) insert schedule_officers (petugas pertama "Ketua Tim", lainnya "Anggota")
      await tx.insert(schedule_officers).values(
        officerIds.map((officerId, i) => ({
          id: randomUUID(),
          schedule_id: newScheduleId,
          officer_id: officerId,
          role_in_team: i === 0 ? "Ketua Tim" : "Anggota",
        })),
      );

      // (4) update berkas: status DIJADWALKAN dan status_updated_at = getNowWibIso()
      await tx
        .update(applications)
        .set({
          status: "DIJADWALKAN",
          status_updated_at: now,
        })
        .where(eq(applications.id, applicationId));

      // (5) insert audit_logs: action "RESCHEDULE_APPLICATION", actor, old_value "tanggal jam lama", new_value `tanggal jam baru | ${CANCEL_CATEGORY_LABEL[category]}: ${reason}`
      await tx.insert(audit_logs).values({
        id: randomUUID(),
        application_id: applicationId,
        action: "RESCHEDULE_APPLICATION",
        actor,
        old_value: `${activeSchedule.inspection_date} ${activeSchedule.inspection_time}`,
        new_value: `${newDate} ${newTime} | ${CANCEL_CATEGORY_LABEL[category]}: ${cleanReason}`,
        ip: null,
        created_at: now,
      });
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    console.error("rescheduleApplication error:", err);
    return {
      ok: false,
      error: "Terjadi kendala saat menjadwalkan ulang pemeriksaan. Silakan coba lagi.",
    };
  }
}

export async function updateOfficialFileNumber(
  applicationId: string,
  newNumber: string,
): Promise<ScheduleActionResult> {
  try {
    const actor = await getSession();
    if (!actor) {
      return { ok: false, error: "Sesi telah berakhir. Silakan login kembali." };
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
          "Hanya berkas berstatus Selesai yang dapat diubah Nomor Berkas-nya.",
      };
    }

    const oldNumber = app.official_file_number;
    if ((oldNumber ?? "").trim() === official) {
      return { ok: true };
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
      return { ok: false, error: "Nomor Berkas sudah dipakai berkas lain." };
    }

    const now = getNowWibIso();
    await db.transaction(async (tx) => {
      await tx
        .update(applications)
        .set({ official_file_number: official })
        .where(eq(applications.id, applicationId));

      await tx.insert(audit_logs).values({
        id: randomUUID(),
        application_id: applicationId,
        action: "UPDATE_OFFICIAL_NUMBER",
        actor,
        old_value: oldNumber ?? "-",
        new_value: official,
        ip: null,
        created_at: now,
      });
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    console.error("updateOfficialFileNumber error:", err);
    return {
      ok: false,
      error: "Terjadi kendala saat mengoreksi Nomor Berkas. Silakan coba lagi.",
    };
  }
}

export async function reopenApplication(
  applicationId: string,
): Promise<ScheduleActionResult> {
  try {
    const actor = await getSession();
    if (!actor) {
      return { ok: false, error: "Sesi telah berakhir. Silakan login kembali." };
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

    const targetStatus =
      latestFinishedSchedule && canRestoreSchedule
        ? "DIJADWALKAN"
        : "VERIFIKASI_PETUGAS";

    const now = getNowWibIso();
    await db.transaction(async (tx) => {
      if (targetStatus === "DIJADWALKAN" && latestFinishedSchedule) {
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

      await tx.insert(audit_logs).values({
        id: randomUUID(),
        application_id: applicationId,
        action: "REOPEN_APPLICATION",
        actor,
        old_value: app.official_file_number ?? "-",
        new_value: targetStatus,
        ip: null,
        created_at: now,
      });
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

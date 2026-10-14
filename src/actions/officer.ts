"use server";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applications, officers, schedule_officers, schedules } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getNowWibIso } from "@/lib/utils";

export type OfficerItem = {
  id: string;
  name: string;
  position: string;
};

export type AddOfficerResult =
  | { ok: true; officer: OfficerItem }
  | { ok: false; error: string };

export type DeleteOfficerResult =
  | { ok: true }
  | { ok: false; error: string };

export async function addOfficer(
  name: string,
  position: string,
): Promise<AddOfficerResult> {
  try {
    if (!(await getSession())) {
      return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
    }

    const cleanName = name.trim();
    const cleanPosition = position.trim();

    if (!cleanName) {
      return { ok: false, error: "Nama petugas wajib diisi." };
    }
    if (!cleanPosition) {
      return { ok: false, error: "Jabatan petugas wajib diisi." };
    }

    const newOfficer: OfficerItem = {
      id: randomUUID(),
      name: cleanName,
      position: cleanPosition,
    };

    await db.insert(officers).values(newOfficer);
    revalidatePath("/admin");
    return { ok: true, officer: newOfficer };
  } catch (err) {
    console.error("addOfficer error:", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menambahkan petugas.",
    };
  }
}

export async function deleteOfficer(
  id: string,
): Promise<DeleteOfficerResult> {
  try {
    if (!(await getSession())) {
      return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
    }

    if (!id) {
      return { ok: false, error: "ID petugas tidak valid." };
    }

    const officer = await db
      .select({ id: officers.id, deletedAt: officers.deleted_at })
      .from(officers)
      .where(eq(officers.id, id))
      .get();

    if (!officer) {
      return { ok: false, error: "Petugas tidak ditemukan." };
    }
    if (officer.deletedAt) {
      return { ok: false, error: "Petugas sudah dinonaktifkan." };
    }

    // Cek apakah petugas sedang bertugas di jadwal aktif
    const activeAssignment = await db
      .select({ id: schedule_officers.id })
      .from(schedule_officers)
      .innerJoin(schedules, eq(schedule_officers.schedule_id, schedules.id))
      .innerJoin(applications, eq(schedules.application_id, applications.id))
      .where(
        and(
          eq(schedule_officers.officer_id, id),
          eq(schedules.status, "AKTIF"),
          isNull(applications.deleted_at),
        ),
      )
      .get();

    if (activeAssignment) {
      return { ok: false, error: "Petugas masih ditugaskan pada jadwal aktif." };
    }

    // Soft delete petugas tanpa menghapus riwayat schedule_officers
    await db
      .update(officers)
      .set({ deleted_at: getNowWibIso() })
      .where(eq(officers.id, id));

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    console.error("deleteOfficer error:", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menghapus petugas.",
    };
  }
}

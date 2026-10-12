"use server";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applications, officers, schedule_officers, schedules } from "@/db/schema";
import { getSession } from "@/lib/session";

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
}

export async function deleteOfficer(
  id: string,
): Promise<DeleteOfficerResult> {
  if (!(await getSession())) {
    return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
  }

  if (!id) {
    return { ok: false, error: "ID petugas tidak valid." };
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

  // Hapus dari schedule_officers (jadwal non-aktif/selesai) dan officers
  await db.transaction(async (tx) => {
    await tx
      .delete(schedule_officers)
      .where(eq(schedule_officers.officer_id, id));
    await tx
      .delete(officers)
      .where(eq(officers.id, id));
  });

  revalidatePath("/admin");
  return { ok: true };
}


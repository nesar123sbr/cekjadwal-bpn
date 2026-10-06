"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { getSession } from "@/lib/session";
import { normalizeFileNumber } from "@/lib/utils";

export type CreateApplicationInput = {
  fileNumber: string;
  applicantName: string;
  objectAddress: string;
};

export type CreateApplicationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createApplication(
  input: CreateApplicationInput,
): Promise<CreateApplicationResult> {
  if (!(await getSession())) {
    return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
  }

  const fileNumber = input.fileNumber.trim();
  const applicantName = input.applicantName.trim();
  const objectAddress = input.objectAddress.trim();

  if (!fileNumber || !applicantName || !objectAddress) {
    return { ok: false, error: "Semua kolom wajib diisi." };
  }

  const normalized = normalizeFileNumber(fileNumber);
  if (!normalized) return { ok: false, error: "Nomor berkas tidak valid." };

  const existing = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.file_number_normalized, normalized))
    .get();
  if (existing) {
    return { ok: false, error: "Nomor berkas sudah terdaftar." };
  }

  try {
    await db.insert(applications).values({
      id: randomUUID(),
      file_number: fileNumber,
      file_number_normalized: normalized,
      applicant_name: applicantName,
      object_address: objectAddress,
      status: "BELUM_DIJADWALKAN",
    });
  } catch {
    // Unique constraint (race condition)
    return { ok: false, error: "Nomor berkas sudah terdaftar." };
  }

  revalidatePath("/admin");
  return { ok: true };
}

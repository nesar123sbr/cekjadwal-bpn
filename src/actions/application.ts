"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { getSession } from "@/lib/session";
import { normalizeTicketNumber } from "@/lib/utils";

export type CreateApplicationInput = {
  ticketNumber: string;
  applicantName: string;
  objectAddress: string;
};

export type ReceiptData = {
  ticketNumber: string;
  applicantName: string;
  objectAddress: string;
  /** ISO timestamp penerimaan berkas. */
  receivedAt: string;
};

export type ApplicationActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type CreateApplicationResult =
  | { ok: true; receipt: ReceiptData }
  | { ok: false; error: string };

export async function createApplication(
  input: CreateApplicationInput,
): Promise<CreateApplicationResult> {
  if (!(await getSession())) {
    return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
  }

  const ticketNumber = input.ticketNumber.trim();
  const applicantName = input.applicantName.trim();
  const objectAddress = input.objectAddress.trim();

  if (!ticketNumber || !applicantName || !objectAddress) {
    return { ok: false, error: "Semua kolom wajib diisi." };
  }

  const normalized = normalizeTicketNumber(ticketNumber);
  if (!normalized) return { ok: false, error: "Nomor tiket tidak valid." };

  const existing = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.ticket_number_normalized, normalized))
    .get();
  if (existing) {
    return { ok: false, error: "Nomor tiket sudah terdaftar." };
  }

  const now = new Date().toISOString();
  try {
    await db.insert(applications).values({
      id: randomUUID(),
      ticket_number: ticketNumber,
      ticket_number_normalized: normalized,
      applicant_name: applicantName,
      object_address: objectAddress,
      status: "VERIFIKASI_PETUGAS",
      created_at: now,
      status_updated_at: now,
    });
  } catch {
    // Unique constraint (race condition)
    return { ok: false, error: "Nomor tiket sudah terdaftar." };
  }

  revalidatePath("/admin");
  return {
    ok: true,
    receipt: {
      ticketNumber,
      applicantName,
      objectAddress,
      receivedAt: now,
    },
  };
}

/**
 * Catat dokumen yang kurang. Teks berisi -> status MENUNGGU_DOKUMEN.
 * Teks kosong -> dokumen dianggap lengkap, status kembali VERIFIKASI_PETUGAS.
 */
export async function updateMissingDocs(
  applicationId: string,
  missingDocuments: string,
): Promise<ApplicationActionResult> {
  if (!(await getSession())) {
    return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
  }

  const app = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .get();
  if (!app) return { ok: false, error: "Berkas tidak ditemukan." };
  if (app.status !== "MENUNGGU_DOKUMEN" && app.status !== "VERIFIKASI_PETUGAS") {
    return {
      ok: false,
      error: "Dokumen hanya dapat dicatat sebelum berkas dijadwalkan.",
    };
  }

  const notes = missingDocuments.trim();
  const nextStatus = notes ? "MENUNGGU_DOKUMEN" : "VERIFIKASI_PETUGAS";

  await db
    .update(applications)
    .set({
      status: nextStatus,
      missing_documents: notes || null,
      // Hanya reset penghitung tahap jika tahap benar-benar berpindah.
      ...(nextStatus !== app.status
        ? { status_updated_at: new Date().toISOString() }
        : {}),
    })
    .where(eq(applications.id, applicationId));

  revalidatePath("/admin");
  return { ok: true };
}

"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { application_visits, applications } from "@/db/schema";
import { getSession } from "@/lib/session";
import { normalizeTicketNumber } from "@/lib/utils";

export type CreateApplicationInput = {
  ticketNumber: string;
  applicantName: string;
  objectAddress: string;
};

export type UpdateApplicationInput = {
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

export type VisitLogItem = {
  id: string;
  applicationId: string;
  visitDate: string;
  notes: string | null;
  createdAt: string;
};

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

  const id = randomUUID();
  const now = new Date().toISOString();
  const todayDate = now.slice(0, 10);

  await db.transaction(async (tx) => {
    await tx.insert(applications).values({
      id,
      ticket_number: ticketNumber,
      ticket_number_normalized: normalized,
      applicant_name: applicantName,
      object_address: objectAddress,
      status: "VERIFIKASI_PETUGAS",
      created_at: now,
      status_updated_at: now,
      deleted_at: null,
    });

    await tx.insert(application_visits).values({
      id: randomUUID(),
      application_id: id,
      visit_date: todayDate,
      notes: "Pendaftaran Berkas Awal",
      created_at: now,
    });
  });

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

export async function updateApplication(
  id: string,
  input: UpdateApplicationInput,
): Promise<ApplicationActionResult> {
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

  const app = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, id), isNull(applications.deleted_at)))
    .get();
  if (!app) return { ok: false, error: "Berkas tidak ditemukan." };

  await db
    .update(applications)
    .set({
      ticket_number: ticketNumber,
      ticket_number_normalized: normalized,
      applicant_name: applicantName,
      object_address: objectAddress,
    })
    .where(eq(applications.id, id));

  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteApplication(
  id: string,
): Promise<ApplicationActionResult> {
  if (!(await getSession())) {
    return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
  }

  const app = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, id), isNull(applications.deleted_at)))
    .get();
  if (!app) return { ok: false, error: "Berkas tidak ditemukan." };

  await db
    .update(applications)
    .set({
      deleted_at: new Date().toISOString(),
    })
    .where(eq(applications.id, id));

  revalidatePath("/admin");
  return { ok: true };
}

export async function addVisitLog(
  applicationId: string,
  visitDate: string,
  notes?: string,
): Promise<ApplicationActionResult> {
  if (!(await getSession())) {
    return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
  }

  const trimmedDate = visitDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    return { ok: false, error: "Format tanggal tidak valid (YYYY-MM-DD)." };
  }

  const app = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), isNull(applications.deleted_at)))
    .get();
  if (!app) return { ok: false, error: "Berkas tidak ditemukan." };

  const now = new Date().toISOString();
  await db.insert(application_visits).values({
    id: randomUUID(),
    application_id: applicationId,
    visit_date: trimmedDate,
    notes: notes?.trim() || null,
    created_at: now,
  });

  revalidatePath("/admin");
  return { ok: true };
}

export async function getVisitLogs(
  applicationId: string,
): Promise<{ ok: true; visits: VisitLogItem[] } | { ok: false; error: string }> {
  if (!(await getSession())) {
    return { ok: false, error: "Sesi berakhir. Silakan login kembali." };
  }

  const rows = await db
    .select({
      id: application_visits.id,
      applicationId: application_visits.application_id,
      visitDate: application_visits.visit_date,
      notes: application_visits.notes,
      createdAt: application_visits.created_at,
    })
    .from(application_visits)
    .where(eq(application_visits.application_id, applicationId))
    .orderBy(desc(application_visits.visit_date), desc(application_visits.created_at));

  return { ok: true, visits: rows };
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
    .where(and(eq(applications.id, applicationId), isNull(applications.deleted_at)))
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

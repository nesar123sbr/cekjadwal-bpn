"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  applications,
  officers,
  schedule_officers,
  schedules,
} from "@/db/schema";
import { daysBetween, normalizeTicketNumber } from "@/lib/utils";
import { maskAddress, maskName } from "@/lib/masking";

type Base = {
  ticketNumber: string;
  applicantName: string;
  objectAddress: string;
  /** Total hari sejak berkas diterima (berhenti dihitung saat selesai). */
  daysInProcess: number;
};

export type SearchResult =
  | { status: "TIDAK_DITEMUKAN" }
  | (Base & {
      status: "DOKUMEN_KURANG";
      missingDocuments: string[];
      /** Hari berkas menunggu kelengkapan dari pemohon. */
      daysWaiting: number;
    })
  | (Base & {
      status: "MENUNGGU_JADWAL";
      /** Hari berkas menunggu jadwal dari petugas. */
      daysWaiting: number;
    })
  | (Base & {
      status: "DIJADWALKAN";
      inspectionDate: string;
      inspectionTime: string;
      notes: string | null;
      officers: { name: string; position: string; role: string | null }[];
    })
  | (Base & {
      status: "SELESAI";
      officialFileNumber: string;
    });

export type SearchInput = { ticketNumber: string; applicantName: string };

const MIN_NAME_LENGTH = 3;

function splitDocs(raw: string | null): string[] {
  return (raw ?? "")
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function searchTicket(input: SearchInput): Promise<SearchResult> {
  const normalized = normalizeTicketNumber(String(input.ticketNumber ?? ""));
  const nameQuery = String(input.applicantName ?? "").trim().toLowerCase();
  if (!normalized || nameQuery.length < MIN_NAME_LENGTH) {
    return { status: "TIDAK_DITEMUKAN" };
  }

  const app = await db
    .select()
    .from(applications)
    .where(eq(applications.ticket_number_normalized, normalized))
    .get();

  // Nama harus cocok sebagian (case-insensitive) sebagai verifikasi kepemilikan.
  // Hasil sama dengan "tidak ditemukan" agar nomor tiket tidak bisa ditebak.
  if (!app || !app.applicant_name.toLowerCase().includes(nameQuery)) {
    return { status: "TIDAK_DITEMUKAN" };
  }

  const stageEnd = app.status === "SELESAI" ? new Date(app.status_updated_at) : new Date();
  const base: Base = {
    ticketNumber: app.ticket_number,
    applicantName: maskName(app.applicant_name),
    objectAddress: maskAddress(app.object_address),
    daysInProcess: daysBetween(app.created_at, stageEnd),
  };
  const daysInStage = daysBetween(app.status_updated_at);

  if (app.status === "SELESAI") {
    return {
      status: "SELESAI",
      ...base,
      officialFileNumber: app.official_file_number ?? "-",
    };
  }

  if (app.status === "MENUNGGU_DOKUMEN") {
    return {
      status: "DOKUMEN_KURANG",
      ...base,
      missingDocuments: splitDocs(app.missing_documents),
      daysWaiting: daysInStage,
    };
  }

  const schedule =
    app.status === "DIJADWALKAN"
      ? await db
          .select()
          .from(schedules)
          .where(
            and(
              eq(schedules.application_id, app.id),
              eq(schedules.status, "AKTIF"),
            ),
          )
          .get()
      : undefined;

  if (!schedule) {
    return { status: "MENUNGGU_JADWAL", ...base, daysWaiting: daysInStage };
  }

  const team = await db
    .select({
      name: officers.name,
      position: officers.position,
      role: schedule_officers.role_in_team,
    })
    .from(schedule_officers)
    .innerJoin(officers, eq(schedule_officers.officer_id, officers.id))
    .where(eq(schedule_officers.schedule_id, schedule.id));

  return {
    status: "DIJADWALKAN",
    ...base,
    inspectionDate: schedule.inspection_date,
    inspectionTime: schedule.inspection_time,
    notes: schedule.notes_for_public,
    officers: team,
  };
}

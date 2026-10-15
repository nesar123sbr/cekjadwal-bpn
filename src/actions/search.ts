"use server";

import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  application_visits,
  applications,
  schedules,
} from "@/db/schema";
import { daysBetween, normalizeNameForMatch, normalizeTicketNumber } from "@/lib/utils";
import { maskAddress, maskName } from "@/lib/masking";

type Base = {
  id: string;
  ticketNumber: string;
  applicantName: string;
  objectAddress: string;
  /** Total hari sejak berkas diterima (berhenti dihitung saat selesai). */
  daysInProcess: number;
  /** Tanggal kunjungan terakhir pemohon ke kantor pertanahan (YYYY-MM-DD). */
  lastVisitDate: string | null;
};

export type SearchResultItem =
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
      previouslyCancelled: boolean;
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

export type SearchResult =
  | { status: "TIDAK_DITEMUKAN" }
  | { status: "GANGGUAN_LAYANAN" }
  | {
      status: "DITEMUKAN";
      items: SearchResultItem[];
    };

export type SearchInput = { ticketNumber: string; applicantName: string };

const MIN_NAME_LENGTH = 3;

function splitDocs(raw: string | null): string[] {
  return (raw ?? "")
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function searchTicket(input: SearchInput): Promise<SearchResult> {
  try {
    const normalized = normalizeTicketNumber(String(input.ticketNumber ?? ""));
    const normalizedInputName = normalizeNameForMatch(String(input.applicantName ?? ""));
    if (!normalized || normalizedInputName.length < MIN_NAME_LENGTH) {
      return { status: "TIDAK_DITEMUKAN" };
    }

    const matchedApps = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.ticket_number_normalized, normalized),
          isNull(applications.deleted_at),
        ),
      );

    // Nama harus cocok utuh setelah dinormalisasi (termasuk buang gelar) sebagai verifikasi kepemilikan.
    // Hasil sama dengan "tidak ditemukan" agar nomor tiket tidak bisa ditebak.
    const validApps = matchedApps.filter(
      (app) => normalizeNameForMatch(app.applicant_name) === normalizedInputName,
    );

    if (validApps.length === 0) {
      return { status: "TIDAK_DITEMUKAN" };
    }

    const appIds = validApps.map((a) => a.id);

    // Ambil riwayat kunjungan untuk semua berkas terkait
    const allVisits = await db
      .select({
        applicationId: application_visits.application_id,
        visitDate: application_visits.visit_date,
      })
      .from(application_visits)
      .where(inArray(application_visits.application_id, appIds))
      .orderBy(desc(application_visits.visit_date), desc(application_visits.created_at));

    // Ambil jadwal aktif jika ada
    const activeSchedules = await db
      .select()
      .from(schedules)
      .where(
        and(
          inArray(schedules.application_id, appIds),
          eq(schedules.status, "AKTIF"),
        ),
      );

    // Ambil riwayat jadwal yang dibatalkan dengan cancel_reason terisi
    const cancelledSchedules = await db
      .select({ applicationId: schedules.application_id })
      .from(schedules)
      .where(
        and(
          inArray(schedules.application_id, appIds),
          eq(schedules.status, "DIBATALKAN"),
          isNotNull(schedules.cancel_reason),
        ),
      );
    const cancelledAppIds = new Set(cancelledSchedules.map((s) => s.applicationId));

    const items: SearchResultItem[] = validApps.map((app) => {
      const stageEnd =
        app.status === "SELESAI" ? new Date(app.status_updated_at) : new Date();
      const appVisits = allVisits.filter((v) => v.applicationId === app.id);
      const lastVisitDate = appVisits[0]?.visitDate ?? null;

      const base: Base = {
        id: app.id,
        ticketNumber: app.ticket_number,
        applicantName: maskName(app.applicant_name),
        objectAddress: maskAddress(app.object_address),
        daysInProcess: daysBetween(app.created_at, stageEnd),
        lastVisitDate,
      };
      const daysInStage = daysBetween(app.status_updated_at);

      if (app.status === "SELESAI") {
        return {
          ...base,
          status: "SELESAI",
          officialFileNumber: app.official_file_number ?? "-",
        };
      }

      if (app.status === "MENUNGGU_DOKUMEN") {
        return {
          ...base,
          status: "DOKUMEN_KURANG",
          missingDocuments: splitDocs(app.missing_documents),
          daysWaiting: daysInStage,
        };
      }

      const schedule =
        app.status === "DIJADWALKAN"
          ? activeSchedules.find((s) => s.application_id === app.id)
          : undefined;

      if (!schedule) {
        return {
          ...base,
          status: "MENUNGGU_JADWAL",
          daysWaiting: daysInStage,
          previouslyCancelled: cancelledAppIds.has(app.id),
        };
      }

      return {
        ...base,
        status: "DIJADWALKAN",
        inspectionDate: schedule.inspection_date,
        inspectionTime: schedule.inspection_time,
        notes: schedule.notes_for_public,
        officers: [],
      };
    });

    return {
      status: "DITEMUKAN",
      items,
    };
  } catch (err) {
    console.error("searchTicket error:", err);
    return { status: "GANGGUAN_LAYANAN" };
  }
}

"use server";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  application_visits,
  applications,
  officers,
  schedule_officers,
  schedules,
} from "@/db/schema";
import { daysBetween, normalizeTicketNumber } from "@/lib/utils";
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
  const normalized = normalizeTicketNumber(String(input.ticketNumber ?? ""));
  const nameQuery = String(input.applicantName ?? "").trim().toLowerCase();
  if (!normalized || nameQuery.length < MIN_NAME_LENGTH) {
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

  // Nama harus cocok sebagian (case-insensitive) sebagai verifikasi kepemilikan.
  // Hasil sama dengan "tidak ditemukan" agar nomor tiket tidak bisa ditebak.
  const validApps = matchedApps.filter((app) =>
    app.applicant_name.toLowerCase().includes(nameQuery),
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

  const scheduleIds = activeSchedules.map((s) => s.id);
  const officersBySchedule =
    scheduleIds.length > 0
      ? await db
          .select({
            scheduleId: schedule_officers.schedule_id,
            name: officers.name,
            position: officers.position,
            role: schedule_officers.role_in_team,
          })
          .from(schedule_officers)
          .innerJoin(officers, eq(schedule_officers.officer_id, officers.id))
          .where(inArray(schedule_officers.schedule_id, scheduleIds))
      : [];

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
      };
    }

    const team = officersBySchedule
      .filter((o) => o.scheduleId === schedule.id)
      .map((o) => ({
        name: o.name,
        position: o.position,
        role: o.role,
      }));

    return {
      ...base,
      status: "DIJADWALKAN",
      inspectionDate: schedule.inspection_date,
      inspectionTime: schedule.inspection_time,
      notes: schedule.notes_for_public,
      officers: team,
    };
  });

  return {
    status: "DITEMUKAN",
    items,
  };
}

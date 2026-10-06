"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  applications,
  officers,
  schedule_officers,
  schedules,
} from "@/db/schema";
import { normalizeFileNumber } from "@/lib/utils";
import { maskAddress, maskName } from "@/lib/masking";

export type SearchResult =
  | { status: "TIDAK_DITEMUKAN" }
  | {
      status: "BELUM_DIJADWALKAN";
      fileNumber: string;
      applicantName: string;
      objectAddress: string;
    }
  | {
      status: "SELESAI";
      fileNumber: string;
      applicantName: string;
      objectAddress: string;
    }
  | {
      status: "DIJADWALKAN";
      fileNumber: string;
      applicantName: string;
      objectAddress: string;
      inspectionDate: string;
      inspectionTime: string;
      notes: string | null;
      officers: { name: string; position: string; role: string | null }[];
    };

export async function searchFileNumber(
  rawInput: string,
): Promise<SearchResult> {
  const normalized = normalizeFileNumber(String(rawInput ?? ""));
  if (!normalized) return { status: "TIDAK_DITEMUKAN" };

  const app = await db
    .select()
    .from(applications)
    .where(eq(applications.file_number_normalized, normalized))
    .get();

  if (!app) return { status: "TIDAK_DITEMUKAN" };

  const base = {
    fileNumber: app.file_number,
    applicantName: maskName(app.applicant_name),
    objectAddress: maskAddress(app.object_address),
  };

  if (app.status === "SELESAI") return { status: "SELESAI", ...base };

  const schedule = await db
    .select()
    .from(schedules)
    .where(
      and(eq(schedules.application_id, app.id), eq(schedules.status, "AKTIF")),
    )
    .get();

  if (!schedule) return { status: "BELUM_DIJADWALKAN", ...base };

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

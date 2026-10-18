import { and, asc, desc, eq, isNotNull, isNull, min } from "drizzle-orm";
import { redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import AdminTable, { type AdminRow } from "@/components/admin/AdminTable";
import BrandHeader from "@/components/BrandHeader";
import TopographicBackground from "@/components/TopographicBackground";
import { db } from "@/db";
import {
  application_visits,
  applications,
  officers,
  schedule_officers,
  schedules,
} from "@/db/schema";
import { getSession } from "@/lib/session";
import { type CancelCategory, daysBetween, parseCancelReason } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Dashboard Loket - CekJadwal BPN Kabupaten Dairi",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  if (!(await getSession())) redirect("/admin/login");

  const [
    apps,
    activeSchedules,
    team,
    officerList,
    inactiveOfficerList,
    visitAggregates,
    cancelledSchedules,
  ] = await Promise.all([
    db
      .select()
      .from(applications)
      .where(isNull(applications.deleted_at))
      .orderBy(desc(applications.created_at)),
    db.select().from(schedules).where(eq(schedules.status, "AKTIF")),
    db
      .select({
        scheduleId: schedule_officers.schedule_id,
        officerId: officers.id,
        name: officers.name,
        roleInTeam: schedule_officers.role_in_team,
      })
      .from(schedule_officers)
      .innerJoin(officers, eq(schedule_officers.officer_id, officers.id))
      .innerJoin(
        schedules,
        and(
          eq(schedule_officers.schedule_id, schedules.id),
          eq(schedules.status, "AKTIF"),
        ),
      ),
    db
      .select()
      .from(officers)
      .where(isNull(officers.deleted_at))
      .orderBy(asc(officers.name)),
    db
      .select()
      .from(officers)
      .where(isNotNull(officers.deleted_at))
      .orderBy(asc(officers.name)),
    db
      .select({
        applicationId: application_visits.application_id,
        firstVisit: min(application_visits.visit_date),
      })
      .from(application_visits)
      .groupBy(application_visits.application_id),
    db
      .select({
        applicationId: schedules.application_id,
        cancelReason: schedules.cancel_reason,
      })
      .from(schedules)
      .where(
        and(
          eq(schedules.status, "DIBATALKAN"),
          isNotNull(schedules.cancel_reason),
        ),
      )
      .orderBy(
        desc(schedules.inspection_date),
        desc(schedules.inspection_time),
      ),
  ]);

  const cancelInfoByApp = new Map<
    string,
    { category: CancelCategory; reason: string }
  >();
  const rescheduleCountByApp = new Map<string, number>();

  for (const cs of cancelledSchedules) {
    if (cs.cancelReason) {
      rescheduleCountByApp.set(
        cs.applicationId,
        (rescheduleCountByApp.get(cs.applicationId) ?? 0) + 1,
      );
      if (!cancelInfoByApp.has(cs.applicationId)) {
        const parsed = parseCancelReason(cs.cancelReason);
        if (parsed) {
          cancelInfoByApp.set(cs.applicationId, parsed);
        }
      }
    }
  }

  const firstVisitByAppId = new Map<string, string>();
  for (const v of visitAggregates) {
    if (v.firstVisit) {
      firstVisitByAppId.set(v.applicationId, v.firstVisit);
    }
  }

  const activeScheduleByAppId = new Map<
    string,
    (typeof activeSchedules)[number]
  >();
  for (const s of activeSchedules) {
    activeScheduleByAppId.set(s.application_id, s);
  }

  type TeamMember = {
    officerId: string;
    name: string;
    roleInTeam: string | null;
  };
  const rawTeamBySchedule = new Map<string, TeamMember[]>();
  for (const member of team) {
    const list = rawTeamBySchedule.get(member.scheduleId);
    if (list) {
      list.push(member);
    } else {
      rawTeamBySchedule.set(member.scheduleId, [member]);
    }
  }

  const teamByScheduleId = new Map<
    string,
    { officerIds: string[]; officerNames: string[] }
  >();
  for (const [schedId, members] of rawTeamBySchedule.entries()) {
    const leaders: TeamMember[] = [];
    const others: TeamMember[] = [];
    for (const m of members) {
      if (m.roleInTeam === "Ketua Tim") {
        leaders.push(m);
      } else {
        others.push(m);
      }
    }
    const sorted = [...leaders, ...others];
    teamByScheduleId.set(schedId, {
      officerIds: sorted.map((t) => t.officerId),
      officerNames: sorted.map((t) => t.name),
    });
  }

  const rows: AdminRow[] = apps.map((a) => {
    const sch = activeScheduleByAppId.get(a.id);
    const firstVisitDate =
      firstVisitByAppId.get(a.id) ?? a.created_at.slice(0, 10);
    const cancelInfo =
      a.status === "VERIFIKASI_PETUGAS"
        ? (cancelInfoByApp.get(a.id) ?? null)
        : null;
    const teamInfo = sch ? teamByScheduleId.get(sch.id) : undefined;

    return {
      id: a.id,
      ticketNumber: a.ticket_number,
      firstVisitDate,
      createdAt: a.created_at,
      applicantName: a.applicant_name,
      address: a.object_address,
      status: a.status,
      missingDocuments: a.missing_documents,
      officialFileNumber: a.official_file_number,
      daysInProcess: daysBetween(
        a.created_at,
        a.status === "SELESAI" ? new Date(a.status_updated_at) : new Date(),
      ),
      daysInStage: daysBetween(a.status_updated_at),
      inspectionDate: sch?.inspection_date ?? null,
      inspectionTime: sch?.inspection_time ?? null,
      notes: sch?.notes_for_public ?? null,
      officerIds: teamInfo?.officerIds ?? [],
      officerNames: teamInfo?.officerNames ?? [],
      lastCancelCategory: cancelInfo?.category ?? null,
      lastCancelReason: cancelInfo?.reason ?? null,
      rescheduleCount: rescheduleCountByApp.get(a.id) ?? 0,
    };
  });

  return (
    <div className="relative min-h-screen bg-slate-50">
      <TopographicBackground />
      <div className="relative z-10">
        <BrandHeader />
        <div className="border-b border-gray-200/90 bg-white/90 backdrop-blur-xs">
          <div className="mx-auto flex w-full max-w-[1536px] items-center justify-between px-3 sm:px-6 lg:px-8 py-3.5">
            <h1 className="text-lg font-bold text-bpn-navy">
              Dashboard Loket - CekJadwal Pemeriksaan Tanah
            </h1>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-bpn-navy px-3 py-1.5 text-sm text-bpn-navy hover:bg-slate-100 transition"
              >
                Keluar (Logout)
              </button>
            </form>
          </div>
        </div>
      </div>
      <main className="relative z-10 mx-auto w-full max-w-[1536px] px-3 sm:px-6 lg:px-8 py-6">
        <AdminTable
          rows={rows}
          officers={officerList.map((o) => ({
            id: o.id,
            name: o.name,
            position: o.position,
          }))}
          inactiveOfficers={inactiveOfficerList.map((o) => ({
            id: o.id,
            name: o.name,
            position: o.position,
          }))}
        />
      </main>
    </div>
  );
}

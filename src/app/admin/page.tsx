import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import AdminTable, { type AdminRow } from "@/components/admin/AdminTable";
import BrandHeader from "@/components/BrandHeader";
import { db } from "@/db";
import {
  applications,
  officers,
  schedule_officers,
  schedules,
} from "@/db/schema";
import { getSession } from "@/lib/session";
import { daysBetween } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard TU - CekJadwal BPN" };

export default async function AdminPage() {
  if (!(await getSession())) redirect("/admin/login");

  const [apps, activeSchedules, team, officerList] = await Promise.all([
    db.select().from(applications).orderBy(asc(applications.ticket_number)),
    db.select().from(schedules).where(eq(schedules.status, "AKTIF")),
    db
      .select({
        scheduleId: schedule_officers.schedule_id,
        officerId: officers.id,
        name: officers.name,
      })
      .from(schedule_officers)
      .innerJoin(officers, eq(schedule_officers.officer_id, officers.id)),
    db.select().from(officers).orderBy(asc(officers.name)),
  ]);

  const rows: AdminRow[] = apps.map((a) => {
    const sch = activeSchedules.find((s) => s.application_id === a.id);
    return {
      id: a.id,
      ticketNumber: a.ticket_number,
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
      officerIds: sch
        ? team.filter((t) => t.scheduleId === sch.id).map((t) => t.officerId)
        : [],
      officerNames: sch
        ? team.filter((t) => t.scheduleId === sch.id).map((t) => t.name)
        : [],
    };
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <BrandHeader />
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-[#002B49]">Dashboard TU - CekJadwal BPN</h1>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-[#002B49] px-3 py-1.5 text-sm text-[#002B49] hover:bg-slate-100"
            >
              Keluar (Logout)
            </button>
          </form>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <AdminTable
          rows={rows}
          officers={officerList.map((o) => ({
            id: o.id,
            name: o.name,
            position: o.position,
          }))}
        />
      </main>
    </div>
  );
}

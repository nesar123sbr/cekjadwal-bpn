import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import AdminTable, { type AdminRow } from "@/components/admin/AdminTable";
import { db } from "@/db";
import {
  applications,
  officers,
  schedule_officers,
  schedules,
} from "@/db/schema";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard TU - CekJadwal BPN" };

export default async function AdminPage() {
  if (!(await getSession())) redirect("/admin/login");

  const [apps, activeSchedules, team, officerList] = await Promise.all([
    db.select().from(applications).orderBy(asc(applications.file_number)),
    db.select().from(schedules).where(eq(schedules.status, "AKTIF")),
    db
      .select({
        scheduleId: schedule_officers.schedule_id,
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
      fileNumber: a.file_number,
      applicantName: a.applicant_name,
      address: a.object_address,
      status: a.status,
      inspectionDate: sch?.inspection_date ?? null,
      inspectionTime: sch?.inspection_time ?? null,
      officerNames: sch
        ? team.filter((t) => t.scheduleId === sch.id).map((t) => t.name)
        : [],
    };
  });

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Dashboard TU - CekJadwal BPN</h1>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Keluar (Logout)
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <AdminTable
          rows={rows}
          officers={officerList.map((o) => ({
            id: o.id,
            name: o.name,
            position: o.position,
          }))}
        />
      </div>
    </main>
  );
}

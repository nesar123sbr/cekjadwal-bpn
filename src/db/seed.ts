import { db } from "./index";
import {
  applications,
  officers,
  schedule_officers,
  schedules,
} from "./schema";
import { normalizeFileNumber } from "../lib/utils";

async function seed() {
  // Reset (urutan child -> parent) agar seed idempotent.
  await db.delete(schedule_officers);
  await db.delete(schedules);
  await db.delete(applications);
  await db.delete(officers);

  await db.insert(officers).values([
    { id: "off-1", name: "Budi Hartono", position: "Penata Pertanahan" },
    { id: "off-2", name: "Siti Rahma", position: "Petugas Ukur" },
  ]);

  const apps = [
    {
      id: "app-1201",
      file_number: "1201/2026",
      applicant_name: "Ahmad Syahputra",
      object_address: "Jl. Merdeka No. 12, Kel. Sukajadi, Kec. Coblong",
      status: "BELUM_DIJADWALKAN",
    },
    {
      id: "app-1202",
      file_number: "1202/2026",
      applicant_name: "Bambang Sudirgo",
      object_address: "Jl. Melati No. 7, Kel. Cihapit, Kec. Bandung Wetan",
      status: "DIJADWALKAN",
    },
    {
      id: "app-1203",
      file_number: "1203/2026",
      applicant_name: "Christine Natalia",
      object_address: "Jl. Kenanga No. 3, Kel. Lebak Gede, Kec. Coblong",
      status: "SELESAI",
    },
  ].map((a) => ({
    ...a,
    file_number_normalized: normalizeFileNumber(a.file_number),
  }));

  await db.insert(applications).values(apps);

  await db.insert(schedules).values({
    id: "sch-1202",
    application_id: "app-1202",
    inspection_date: "2026-10-15",
    inspection_time: "09:00",
    status: "AKTIF",
    notes_for_public: "Harap patok batas terpasang",
  });

  await db.insert(schedule_officers).values([
    {
      id: "so-1",
      schedule_id: "sch-1202",
      officer_id: "off-1",
      role_in_team: "Ketua Tim",
    },
    {
      id: "so-2",
      schedule_id: "sch-1202",
      officer_id: "off-2",
      role_in_team: "Pengukur",
    },
  ]);

  console.log("Seed selesai.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

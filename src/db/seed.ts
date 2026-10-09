import { db } from "./index";
import {
  application_visits,
  applications,
  officers,
  schedule_officers,
  schedules,
  type ApplicationStatus,
} from "./schema";
import { normalizeTicketNumber } from "../lib/utils";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

type SeedApp = {
  id: string;
  ticket_number: string;
  applicant_name: string;
  object_address: string;
  status: ApplicationStatus;
  missing_documents?: string;
  official_file_number?: string;
  created_at: string;
  status_updated_at: string;
};

async function seed() {
  // Reset (urutan child -> parent) agar seed idempotent.
  await db.delete(application_visits);
  await db.delete(schedule_officers);
  await db.delete(schedules);
  await db.delete(applications);
  await db.delete(officers);

  await db.insert(officers).values([
    { id: "off-1", name: "Budi Hartono", position: "Penata Pertanahan" },
    { id: "off-2", name: "Siti Rahma", position: "Petugas Ukur" },
  ]);

  const apps: SeedApp[] = [
    {
      // Skenario 1: dokumen kurang (hambatan di pihak warga)
      id: "app-1201",
      ticket_number: "REG-1201/2026",
      applicant_name: "Ahmad Syahputra",
      object_address: "Jl. Merdeka No. 12, Kel. Sukajadi, Kec. Coblong",
      status: "MENUNGGU_DOKUMEN",
      missing_documents:
        "FC KTP batas tanah sebelah utara\nSurat sporadik belum ttd kades",
      created_at: daysAgo(9),
      status_updated_at: daysAgo(6),
    },
    {
      // Skenario 1b: nomor tiket sama beda bidang tanah (mendukung tiket non-unique & multiple parcels)
      id: "app-1201-b",
      ticket_number: "REG-1201/2026",
      applicant_name: "Ahmad Syahputra",
      object_address: "Jl. Dago Barat No. 45, Kel. Dago, Kec. Coblong",
      status: "VERIFIKASI_PETUGAS",
      created_at: daysAgo(5),
      status_updated_at: daysAgo(5),
    },
    {
      // Skenario 2: sudah terjadwal
      id: "app-1202",
      ticket_number: "REG-1202/2026",
      applicant_name: "Bambang Sudirgo",
      object_address: "Jl. Melati No. 7, Kel. Cihapit, Kec. Bandung Wetan",
      status: "DIJADWALKAN",
      created_at: daysAgo(12),
      status_updated_at: daysAgo(2),
    },
    {
      // Skenario 3: selesai, sudah ber-nomor berkas resmi
      id: "app-1203",
      ticket_number: "REG-1203/2026",
      applicant_name: "Christine Natalia",
      object_address: "Jl. Kenanga No. 3, Kel. Lebak Gede, Kec. Coblong",
      status: "SELESAI",
      official_file_number: "1203/2026",
      created_at: daysAgo(20),
      status_updated_at: daysAgo(3),
    },
  ];

  await db.insert(applications).values(
    apps.map((a) => ({
      ...a,
      ticket_number_normalized: normalizeTicketNumber(a.ticket_number),
      missing_documents: a.missing_documents ?? null,
      official_file_number: a.official_file_number ?? null,
      deleted_at: null,
    })),
  );

  // Insert riwayat kedatangan pemohon (application_visits)
  await db.insert(application_visits).values([
    // app-1201
    {
      id: "vis-1201-1",
      application_id: "app-1201",
      visit_date: daysAgo(9).slice(0, 10),
      notes: "Pendaftaran Berkas Awal di loket pelayanan",
      created_at: daysAgo(9),
    },
    {
      id: "vis-1201-2",
      application_id: "app-1201",
      visit_date: daysAgo(6).slice(0, 10),
      notes: "Konsultasi kelengkapan berkas yang kurang",
      created_at: daysAgo(6),
    },
    // app-1201-b
    {
      id: "vis-1201b-1",
      application_id: "app-1201-b",
      visit_date: daysAgo(5).slice(0, 10),
      notes: "Pendaftaran Berkas Awal (Bidang ke-2)",
      created_at: daysAgo(5),
    },
    // app-1202
    {
      id: "vis-1202-1",
      application_id: "app-1202",
      visit_date: daysAgo(12).slice(0, 10),
      notes: "Pendaftaran Berkas Awal",
      created_at: daysAgo(12),
    },
    {
      id: "vis-1202-2",
      application_id: "app-1202",
      visit_date: daysAgo(2).slice(0, 10),
      notes: "Konfirmasi persiapan patok batas bidang tanah",
      created_at: daysAgo(2),
    },
    // app-1203
    {
      id: "vis-1203-1",
      application_id: "app-1203",
      visit_date: daysAgo(20).slice(0, 10),
      notes: "Pendaftaran Berkas Awal",
      created_at: daysAgo(20),
    },
    {
      id: "vis-1203-2",
      application_id: "app-1203",
      visit_date: daysAgo(10).slice(0, 10),
      notes: "Penyerahan kelengkapan berkas fisik",
      created_at: daysAgo(10),
    },
    {
      id: "vis-1203-3",
      application_id: "app-1203",
      visit_date: daysAgo(3).slice(0, 10),
      notes: "Pengecekan akhir hasil ukur lapangan",
      created_at: daysAgo(3),
    },
  ]);

  await db.insert(schedules).values([
    {
      id: "sch-1202",
      application_id: "app-1202",
      inspection_date: new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10),
      inspection_time: "09:00",
      status: "AKTIF",
      notes_for_public: "Harap patok batas terpasang",
    },
    {
      id: "sch-1203",
      application_id: "app-1203",
      inspection_date: new Date(Date.now() - 4 * DAY).toISOString().slice(0, 10),
      inspection_time: "10:00",
      status: "SELESAI",
      notes_for_public: "Harap patok batas terpasang",
    },
  ]);

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

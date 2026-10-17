# CekJadwal BPN - Kantor Pertanahan Kabupaten Dairi

Sistem Pemantauan Pra-Berkas & Verifikasi Lapangan untuk Kantor Pertanahan Kabupaten Dairi. Aplikasi ini memungkinkan masyarakat pemohon memeriksa progres berkas dan jadwal pemeriksaan tanah secara mandiri melalui nomor tiket, serta menyediakan dashboard internal bagi petugas loket untuk mengelola antrean berkas, penugasan petugas, pembatalan & jadwal ulang, dan verifikasi lapangan.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, Server Actions)
- **Bahasa**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database & ORM**: Turso (libSQL) & Drizzle ORM
- **Autentikasi**: Cookie-based Session (Iron-session / Signed Cookies)

---

## Perintah Kerja (Scripts)

| Perintah | Deskripsi |
| :--- | :--- |
| `npm run dev` | Menjalankan server pengembangan lokal di `http://localhost:3000`. |
| `npm run build` | Menjalankan proses kompilasi dan optimasi build produksi Next.js. |
| `npm run lint` | Menjalankan linter ESLint untuk memeriksa kebersihan kode. |
| `npx tsc --noEmit` | Memeriksa validitas tipe TypeScript di seluruh proyek tanpa menghasilkan berkas output. |
| `npx drizzle-kit push` | Menerapkan (push) skema dari `src/db/schema.ts` ke database target. **Peringatan**: Pastikan `.env` mengarah ke database yang sesuai sebelum menjalankan perintah ini. |
| `npm run seed` *(atau `npx tsx src/db/seed.ts`)* | Mengisi data awal/sampel untuk pengujian lokal. **Peringatan Keras**: Hanya boleh dijalankan di environment lokal pengembangan dengan `ALLOW_SEED=true`. Dilarang keras dijalankan pada database production. |

---

## Environment Variables

Salin berkas `.env.example` menjadi `.env` lalu sesuaikan nilainya:

```bash
cp .env.example .env
```

| Variabel | Keterangan | Wajib / Opsional |
| :--- | :--- | :---: |
| `TURSO_DATABASE_URL` | URL koneksi database Turso / libSQL (misal `libsql://...` atau `file:local.db`). | **Wajib** |
| `TURSO_AUTH_TOKEN` | Auth token untuk autentikasi ke database Turso. | **Wajib** (pada remote Turso) |
| `ADMIN_USERNAME` | Username akun petugas loket pertama untuk akses dashboard. | **Wajib** |
| `ADMIN_PASSWORD` | Password akun petugas loket pertama. | **Wajib** |
| `ADMIN_USERNAME_2` | Username akun petugas loket kedua (jika ada). | Opsional *(keduanya harus diisi bersama `ADMIN_PASSWORD_2`)* |
| `ADMIN_PASSWORD_2` | Password akun petugas loket kedua. | Opsional |
| `SESSION_SECRET` | Kunci rahasia enkripsi sesi cookie. Wajib string acak minimal 32 karakter pada production. | **Wajib** (Production) |
| `ALLOW_SEED` | Flag proteksi eksekusi seed database. Hanya bernilai `true` saat pengujian data lokal. | Opsional (Default: `false`) |

---

## Prosedur Deployment ke Production

Untuk memastikan integritas aplikasi dan skema database, ikuti urutan deploy berikut:

1. **Konfigurasi Environment Variables**:
   Daftarkan seluruh environment variable yang dibutuhkan (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, dst.) pada platform hosting (misal Vercel / Cloud Provider).
2. **Push Skema Database Terlebih Dahulu**:
   Pastikan skema database sudah ter-update dengan menjalankan migrasi atau `npx drizzle-kit push` ke database production sebelum kode baru aktif.
3. **Deploy & Build Kode Aplikasi**:
   Jalankan deployment aplikasi (`npm run build`) setelah database siap menerima relasi dan kolom data terbaru.

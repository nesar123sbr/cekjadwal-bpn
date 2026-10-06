"use client";

import { useState } from "react";
import type { SearchResult } from "@/actions/search";
import SearchForm from "@/components/public/SearchForm";
import ScheduleResult from "@/components/public/ScheduleResult";

export default function Home() {
  const [result, setResult] = useState<SearchResult | null>(null);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 sm:py-16">
        <header className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">CekJadwal BPN</h1>
          <p className="mt-2 text-sm text-gray-600">
            Masukkan nomor berkas untuk melihat jadwal pengukuran lapangan.
          </p>
        </header>
        <SearchForm onResult={setResult} />
        {result && <ScheduleResult result={result} />}
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import type { SearchResult } from "@/actions/search";
import SearchForm from "@/components/public/SearchForm";
import ScheduleResult from "@/components/public/ScheduleResult";

export default function PublicSearch({
  initialTicket,
  initialName,
}: {
  initialTicket?: string;
  initialName?: string;
}) {
  const [result, setResult] = useState<SearchResult | null>(null);

  return (
    <>
      <SearchForm
        onResult={setResult}
        initialTicket={initialTicket}
        initialName={initialName}
      />
      {result && <ScheduleResult result={result} />}
    </>
  );
}

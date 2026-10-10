"use client";

import { useState } from "react";
import { Segmented } from "@/components/segmented";
import { UpgradesView } from "./upgrades-view";
import { LIBRARIES, type Library } from "@/lib/libraries";

// One view per library behind a switch. Both stay mounted (the other one
// hidden), so switching keeps each one's choices.
export default function UpgradesPage() {
  const [library, setLibrary] = useState<Library>("movies");
  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Upgrades</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your files against the favorite groups&apos; releases</p>
        </div>
        <Segmented
          label="Library"
          segments={LIBRARIES}
          value={library}
          onChange={setLibrary}
          className="w-full sm:w-auto"
        />
      </div>
      {LIBRARIES.map((l) => (
        <div key={l.key} hidden={l.key !== library}>
          <UpgradesView library={l.key} />
        </div>
      ))}
    </main>
  );
}

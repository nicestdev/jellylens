"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UpgradesView } from "./upgrades-view";
import type { Library } from "./logic";

const TABS: { library: Library; label: string }[] = [
  { library: "movies", label: "Movies" },
  { library: "shows", label: "TV Shows" },
];

// One tab per library, like Analytics; both stay mounted, so switching
// keeps each one's choices.
export default function UpgradesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Tabs defaultValue="movies" className="gap-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Upgrades</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your files against the favorite groups&apos; releases</p>
          </div>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.library} value={t.library} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {TABS.map((t) => (
          <TabsContent key={t.library} value={t.library} keepMounted>
            <UpgradesView library={t.library} />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}

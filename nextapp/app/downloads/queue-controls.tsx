"use client";

import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DownloadsResponse } from "@/lib/api-types";
import { canPauseAll, canResumeAll } from "./logic";

export type QueueChange = { paused?: boolean };

// Running's heading actions, small outline buttons like the page's Add
// links: Pause all / Resume all, each only when
// there's something to pause or resume (both when some packages run and
// others are paused).
export function QueueActions({ data, onChange }: { data: DownloadsResponse; onChange: (change: QueueChange) => void }) {
  const pause = canPauseAll(data.packages);
  const resume = canResumeAll(data.packages);
  if (!pause && !resume) return null;
  return (
    <span className="flex shrink-0 items-center gap-2">
      {pause ? (
        <Button variant="outline" size="sm" onClick={() => onChange({ paused: true })}>
          <Pause />
          Pause all
        </Button>
      ) : null}
      {resume ? (
        <Button variant="outline" size="sm" onClick={() => onChange({ paused: false })}>
          <Play />
          Resume all
        </Button>
      ) : null}
    </span>
  );
}

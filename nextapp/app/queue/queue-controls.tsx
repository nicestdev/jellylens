import { Pause, Play } from "lucide-react";
import type { PageMenuItem } from "@/components/page-menu";
import type { DownloadsResponse } from "@/lib/api-types";
import { canPauseAll, canResumeAll } from "./logic";

export type QueueChange = { paused?: boolean };

// The page's ⋯ (PageMenu): Pause all / Resume all, each only when
// there's something to pause or resume (both when some packages run and
// others are paused).
export function queueItems(data: DownloadsResponse, onChange: (change: QueueChange) => void): PageMenuItem[] {
  return [
    ...(canPauseAll(data.packages)
      ? [{ icon: Pause, label: "Pause all", onClick: () => onChange({ paused: true }) }]
      : []),
    ...(canResumeAll(data.packages)
      ? [{ icon: Play, label: "Resume all", onClick: () => onChange({ paused: false }) }]
      : []),
  ];
}

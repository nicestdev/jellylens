"use client";

import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CODEC_PICKS, QUALITY_PICKS, type CodecPick, type QualityPick } from "./logic";

// Format: what the releases switched to must be, in one toolbar menu: its quality
// and codec (one each), and whether it must add the original audio. The
// button counts what's off its default (the chips below name it) and is
// tinted then, like a FacetMenu with picks.
export function FormatMenu({
  quality,
  codec,
  onlyAudio,
  onQuality,
  onCodec,
  onOnlyAudio,
}: {
  quality: QualityPick;
  codec: CodecPick;
  onlyAudio: boolean;
  onQuality: (q: QualityPick) => void;
  onCodec: (c: CodecPick) => void;
  onOnlyAudio: (on: boolean) => void;
}) {
  const changed = Number(quality !== "same") + Number(codec !== "any") + Number(onlyAudio);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "shrink-0",
          changed > 0 && "border-primary/50 bg-primary/10 text-foreground",
        )}
      >
        Format
        {changed > 0 ? (
          <span className="rounded-sm bg-primary px-1 text-xs font-semibold text-primary-foreground tabular-nums">
            {changed}
          </span>
        ) : null}
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Quality</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={quality} onValueChange={(v) => onQuality(v as QualityPick)}>
            {QUALITY_PICKS.map((q) => (
              <DropdownMenuRadioItem key={q.key} value={q.key} closeOnClick={false}>
                {q.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Codec</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={codec} onValueChange={(v) => onCodec(v as CodecPick)}>
            {CODEC_PICKS.map((c) => (
              <DropdownMenuRadioItem key={c.key} value={c.key} closeOnClick={false}>
                {c.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Audio</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={onlyAudio} onCheckedChange={onOnlyAudio} closeOnClick={false}>
            Adds original audio
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

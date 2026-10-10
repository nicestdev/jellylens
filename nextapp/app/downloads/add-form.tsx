"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, FileUp, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageMenu, type PageMenuItem } from "@/components/page-menu";
import { apiFetch } from "@/lib/api-client";
import type { DownloadsResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const dlcs = (files: FileList | null | undefined) => [...(files ?? [])].filter((f) => /\.dlc$/i.test(f.name));
const dragsFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));

// Where packages come in: DLC containers dropped anywhere on the page (an
// overlay shows while they're dragged over it) or picked with "Upload
// DLC" in the page's ⋯ (with the page's other items, more), or links
// pasted ("Add links" opens a box below the heading). They come in as new
// packages; nothing downloads until one is started.
export function AddControls({
  more,
  onAdded,
  onError,
}: {
  more: PageMenuItem[][];
  onAdded: (data: DownloadsResponse) => void;
  onError: (message: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState("");
  const [showLinks, setShowLinks] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function send(containers: File[], linkText: string) {
    if (!containers.length && !linkText.trim()) return;
    const form = new FormData();
    for (const f of containers) form.append("containers", f);
    form.set("links", linkText);
    setBusy(true);
    onError("");
    try {
      const res = await apiFetch<DownloadsResponse>("/api/downloads", { method: "POST", body: form });
      setLinks("");
      setShowLinks(false);
      onAdded(res);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // The listeners below are set once; they reach the latest callbacks
  // through these.
  const sendRef = useRef(send);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    sendRef.current = send;
    onErrorRef.current = onError;
  });

  // The whole window takes the drop. Enter and leave fire for every child
  // passed over, so a counter tells when the drag has really left.
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!dragsFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!dragsFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overHandler = (e: DragEvent) => {
      if (dragsFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!dragsFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = dlcs(e.dataTransfer?.files);
      if (files.length) sendRef.current(files, "");
      else onErrorRef.current("Only .dlc containers can be dropped here.");
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overHandler);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overHandler);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return (
    <>
      <PageMenu
        groups={[
          [
            { icon: FileUp, label: "Upload DLC", onClick: () => input.current?.click(), disabled: busy },
            { icon: Link2, label: "Add links", onClick: () => setShowLinks(true) },
          ],
          ...more,
        ]}
      />
      <input
        ref={input}
        type="file"
        accept=".dlc"
        multiple
        hidden
        onChange={(e) => {
          send(dlcs(e.target.files), "");
          e.target.value = "";
        }}
      />

      {showLinks ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send([], links);
          }}
          className="flex w-full basis-full flex-col gap-2"
        >
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={4}
            autoFocus
            placeholder="https://ddownload.com/… — one per line, one package"
            aria-label="Links"
            className="w-full rounded-lg border border-input bg-input/30 px-2.5 py-2 font-mono text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowLinks(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={busy || !links.trim()}>
              Add links
            </Button>
          </div>
        </form>
      ) : null}

      {/* What the page shows while files are dragged over it. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 z-40 grid place-items-center bg-background/80 p-4 backdrop-blur-sm transition-opacity duration-150",
          over ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex size-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/70">
          <FileDown className="size-8 text-primary" />
          <p className="mt-3 text-sm font-medium">Drop DLC files to add them</p>
        </div>
      </div>
    </>
  );
}

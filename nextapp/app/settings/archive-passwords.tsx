"use client";

import { useRef, useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CELL, MUTED_CELL, ROW, TITLE_CELL } from "@/components/library-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ConfirmItem } from "@/components/confirm-item";
import { TableFrame } from "@/components/section-frame";
import { AddButton, AddRow } from "./add-row";

// The archive passwords, tried top to bottom on an encrypted archive (then
// ARCHIVE_PASSWORDS). save takes the whole new list and throws if it
// couldn't be saved.
export function ArchivePasswords({
  passwords,
  save,
  onError,
}: {
  passwords: string[] | null;
  save: (passwords: string[]) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  // One save at a time: each sends the whole list, so a second one started
  // before the first came back would send it without the first's change.
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  async function change(next: (list: string[]) => string[], failed: string): Promise<boolean> {
    if (!passwords || busy.current) return false;
    busy.current = true;
    onError("");
    setSaving(true);
    try {
      await save(next(passwords));
      return true;
    } catch (err) {
      onError(`${failed}: ${(err as Error).message}`);
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function submit() {
    const wanted = value.trim();
    if (wanted && (await change((list) => [...list, wanted], "Couldn't add the password"))) setValue("");
  }

  const remove = (password: string) =>
    change((list) => list.filter((p) => p !== password), "Couldn't remove the password");

  return (
    <TableFrame
      title="Archive passwords"
      count={passwords?.length}
      minWidth="min-w-0"
      columns={[
        { label: "Password" },
        {
          label: <AddButton label="Add password" onClick={() => setOpen(true)} disabled={passwords === null} />,
        },
      ]}
    >
      {passwords === null ? (
        <tr className={ROW}>
          <td colSpan={2} className={CELL}>
            <Skeleton className="h-5 w-full" />
          </td>
        </tr>
      ) : passwords.length === 0 && !open ? (
        <tr className={ROW}>
          <td className={MUTED_CELL} colSpan={2}>
            None yet
          </td>
        </tr>
      ) : null}
      {(passwords ?? []).map((p) => (
        <tr key={p} className={ROW}>
          <td className={cn(TITLE_CELL, "font-mono text-xs")}>{p}</td>
          <td className={cn(CELL, "py-0 text-right")}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`More options for ${p}`}
                className={cn(
                  buttonVariants({
                    variant: "ghost",
                    size: "icon-xs",
                    className: "align-middle text-muted-foreground",
                  }),
                )}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto">
                <ConfirmItem plain icon={Trash2} label="Remove" onConfirm={() => remove(p)} />
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      ))}
      {open ? (
        <AddRow
          value={value}
          onChange={setValue}
          onSubmit={submit}
          onClose={() => setOpen(false)}
          placeholder="Add password"
          columns={2}
          adding={saving && value.trim() !== ""}
          className="font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
      ) : null}
    </TableFrame>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CELL, DataTable, MUTED_CELL, ROW, TITLE_CELL } from "@/components/library-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionTitle } from "@/components/section-title";
import { cn } from "@/lib/utils";
import { SECTION } from "./logic";
import { AddRow } from "./add-row";

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
  const [adding, setAdding] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const wanted = value.trim();
    if (!wanted || !passwords) return;
    onError("");
    setAdding(true);
    try {
      await save([...passwords, wanted]);
      setValue("");
    } catch (err) {
      onError(`Couldn't add the password: ${(err as Error).message}`);
    } finally {
      setAdding(false);
    }
  }

  async function remove(password: string) {
    if (!passwords) return;
    onError("");
    try {
      await save(passwords.filter((p) => p !== password));
    } catch (err) {
      onError(`Couldn't remove the password: ${(err as Error).message}`);
    }
  }

  return (
    <section aria-label="Archive passwords" className={cn("min-w-0", SECTION)}>
      <SectionTitle count={passwords?.length} hint="Tried in turn when an archive is encrypted.">
        Archive passwords
      </SectionTitle>
      {passwords === null ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <DataTable flat columns={[{ label: "Password" }, { label: "Options", hidden: true }]}>
          {passwords.length === 0 ? (
            <tr className={ROW}>
              <td className={MUTED_CELL} colSpan={2}>
                None yet
              </td>
            </tr>
          ) : null}
          {passwords.map((p) => (
            <tr key={p} className={ROW}>
              <td className={cn(TITLE_CELL, "font-mono text-xs")} title={p}>
                {p}
              </td>
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
                    <DropdownMenuItem variant="destructive" onClick={() => remove(p)}>
                      <Trash2 />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      <AddRow
        value={value}
        onChange={setValue}
        onSubmit={submit}
        label="Add an archive password"
        autoComplete="off"
        spellCheck={false}
        adding={adding}
        disabled={passwords === null}
      />
    </section>
  );
}

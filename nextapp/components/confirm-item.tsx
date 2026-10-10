"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// A menu item whose action can't be undone: the first click arms it
// ("Sure? Click again", the menu stays open) for ARM_MS, the second
// does it. Red for what deletes (Remove, Delete, Replace), plain otherwise
// (Reset).
const ARM_MS = 3000;

export function ConfirmItem({
  icon: Icon,
  label,
  plain,
  onConfirm,
}: {
  icon: LucideIcon;
  label: string;
  plain?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <DropdownMenuItem
      variant={plain ? "default" : "destructive"}
      closeOnClick={armed}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={cn(armed && (plain ? "bg-accent" : "bg-destructive/15"))}
    >
      <Icon />
      {armed ? "Sure? Click again" : label}
    </DropdownMenuItem>
  );
}

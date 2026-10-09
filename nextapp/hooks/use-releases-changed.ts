"use client";

import { RELEASES_CHANGED } from "@/lib/api-client";
import { useWindowEvent } from "./use-window-event";

// Runs onChange when a match was fixed on a title page opened over this
// one (RELEASES_CHANGED), so what it lists can load again.
export const useReleasesChanged = (onChange: () => void) => useWindowEvent(RELEASES_CHANGED, () => onChange());

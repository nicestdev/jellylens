// Jellylens mark: a magnifier with a small bar chart inside — looking closely
// at your library. Freestanding (no tile), drawn inline so it scales crisply.
// app/icon.svg is the same mark for the browser tab (the palette's accent, fixed);
// keep the two in sync.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="10 10 43 43" className={className} role="img" aria-label="Jellylens">
      <circle cx="28" cy="28" r="14" fill="none" className="stroke-primary" strokeWidth="5" />
      <path d="M38.5 38.5 48 48" className="stroke-primary" strokeWidth="6.5" strokeLinecap="round" />
      <rect x="20.5" y="27" width="4" height="8" rx="2" className="fill-primary" fillOpacity=".6" />
      <rect x="26" y="22" width="4" height="13" rx="2" className="fill-primary" />
      <rect x="31.5" y="25" width="4" height="10" rx="2" className="fill-primary" fillOpacity=".8" />
    </svg>
  );
}

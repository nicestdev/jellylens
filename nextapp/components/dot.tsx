import { Fragment, type ReactNode } from "react";

// The "·" between values, at half their color so the values stand out
// (any color: a red Status line's too).
export const Dot = ({ className }: { className?: string }) => (
  <span className={className ? `opacity-50 ${className}` : "opacity-50"}>·</span>
);

// Values with a Dot between, a space each side, the empty ones left out
// ("2001 · 9 seasons"); tight: none, for a release's attributes
// ("VECTOR·4K·x265·DL"). The logic hands out the values; only here do they
// get their dots.
export function Dots({ parts, tight }: { parts: ReactNode[]; tight?: boolean }) {
  return parts.filter(Boolean).map((p, i) => (
    <Fragment key={i}>
      {i ? (
        tight ? (
          <Dot />
        ) : (
          <>
            {" "}
            <Dot />{" "}
          </>
        )
      ) : null}
      {p}
    </Fragment>
  ));
}

// A value that's either one piece or values to show with Dots.
export const shown = (node: ReactNode | ReactNode[]) => (Array.isArray(node) ? <Dots parts={node} /> : node);

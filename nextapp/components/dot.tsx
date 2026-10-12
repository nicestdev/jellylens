import { Fragment, type ReactNode } from "react";

// The "·" between values, at half their color so the values stand out
// (any color: a red Status line's too).
export const Dot = ({ className }: { className?: string }) => (
  <span className={className ? `opacity-50 ${className}` : "opacity-50"}>·</span>
);

// Values with a Dot between, the empty ones left out: tight in Mono data
// ("Loading·54 %"), spaced in Sans and in a heading ("2001 · 9 seasons").
// The logic hands out the values; only here do they get their dots.
export function Dots({ parts, spaced }: { parts: ReactNode[]; spaced?: boolean }) {
  return parts.filter(Boolean).map((p, i) => (
    <Fragment key={i}>
      {i ? (
        spaced ? (
          <>
            {" "}
            <Dot />{" "}
          </>
        ) : (
          <Dot />
        )
      ) : null}
      {p}
    </Fragment>
  ));
}

// A value that's either one piece or values to show with Dots.
export const shown = (node: ReactNode | ReactNode[], spaced?: boolean) =>
  Array.isArray(node) ? <Dots parts={node} spaced={spaced} /> : node;

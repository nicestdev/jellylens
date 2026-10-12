import { Fragment } from "react";

// A release or file name that may wrap after its dots (on phones, where it
// isn't cut short), not in the middle of a word; or after another
// separator (an env name's underscores).
export function Breakable({ text, separator = "." }: { text: string; separator?: string }) {
  return text.split(separator).map((part, i) => (
    <Fragment key={i}>
      {i ? separator : null}
      {i ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

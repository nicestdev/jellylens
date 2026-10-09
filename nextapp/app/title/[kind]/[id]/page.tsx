import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TitleView } from "@/components/title-view";
import { tileKeyOf } from "@/lib/title-path";

// A title's page, opened on its own (a link, a reload); from a list it
// opens as an overlay instead (app/@modal/(.)title).
export default async function TitlePage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const key = tileKeyOf(kind, id);
  if (!key) notFound();
  return (
    <Suspense>
      <TitleView tileKey={key} />
    </Suspense>
  );
}

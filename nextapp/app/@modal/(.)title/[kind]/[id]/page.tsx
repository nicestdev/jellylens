import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TitleView } from "@/components/title-view";
import { tileKeyOf } from "@/lib/title-path";

// A title's page opened from a list (Releases, Upgrades, Discover, the
// Wishlist, Missing): over it, so going back finds the list as it was.
export default async function TitleOverlay({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const key = tileKeyOf(kind, id);
  if (!key) notFound();
  return (
    <Suspense>
      <TitleView tileKey={key} overlay />
    </Suspense>
  );
}

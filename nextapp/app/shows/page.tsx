import { currentUser } from "@/lib/auth";
import { ShowsView } from "./shows-view";

export default async function ShowsPage() {
  return <ShowsView admin={(await currentUser())?.admin ?? false} />;
}

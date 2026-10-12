import { currentUser } from "@/lib/auth";
import { MoviesView } from "./movies-view";

export default async function MoviesPage() {
  return <MoviesView admin={(await currentUser())?.admin ?? false} />;
}

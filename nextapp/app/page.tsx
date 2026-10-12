import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

// Admins start on the Dashboard, everyone else on Movies.
export default async function Home() {
  const user = await currentUser();
  redirect(user?.admin ? "/dashboard" : "/movies");
}

import { redirect } from "next/navigation";

// Import is called Organize now; old links land there.
export default function ImportPage() {
  redirect("/organize");
}

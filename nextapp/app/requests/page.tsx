import { redirect } from "next/navigation";

// Requests became two pages, Discover and Wishlist; old links land on the
// list.
export default function RequestsPage() {
  redirect("/wishlist");
}

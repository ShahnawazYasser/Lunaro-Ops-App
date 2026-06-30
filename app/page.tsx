// Middleware handles all redirects for this route.
// This shell only runs if middleware passes through (shouldn't happen in practice).
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();
  redirect(session ? "/entry" : "/login");
}

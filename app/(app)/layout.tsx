import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getVerifiedSession } from "@/lib/auth";

// One session check and one nav for every signed-in screen. Pages still do their
// own role check (a layout does not re-run on client navigation, a page does).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.mustSetPin) redirect("/set-pin");

  return (
    <AppShell role={session.role} name={session.name}>
      {children}
    </AppShell>
  );
}

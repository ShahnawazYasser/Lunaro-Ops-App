import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import SetPinClient from "./SetPinClient";

export default async function SetPinPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  return <SetPinClient name={session.name} firstTime={session.mustSetPin} />;
}

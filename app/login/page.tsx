import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LoginClient from "./LoginClient";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/entry");
  return <LoginClient />;
}

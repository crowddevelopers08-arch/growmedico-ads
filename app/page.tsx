import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Root page: redirect to dashboard or login
export default async function RootPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }
  redirect("/login");
}

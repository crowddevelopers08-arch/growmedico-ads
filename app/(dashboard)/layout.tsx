import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <SessionProvider session={session}>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}

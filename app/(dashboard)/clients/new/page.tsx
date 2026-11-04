import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { PageHeader } from "@/components/shared/PageHeader";
import { ClientForm } from "@/components/clients/ClientForm";

export const metadata: Metadata = {
  title: "Add Client",
};

export default function NewClientPage() {
  return (
    <div className="flex flex-col">
      <Header title="Add client" parent={{ label: "Clients", href: "/clients" }} />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 animate-fade-in md:p-8">
        <PageHeader
          title="Add a new client"
          description="Connect a Google Ads or Meta Ads account to start monitoring its campaigns."
        />
        <ClientForm mode="create" />
      </div>
    </div>
  );
}

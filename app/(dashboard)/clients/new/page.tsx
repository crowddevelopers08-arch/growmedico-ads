import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { ClientForm } from "@/components/clients/ClientForm";

export const metadata: Metadata = {
  title: "Add Client",
};

export default function NewClientPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Add Client" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full animate-fade-in">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Add New Client</h2>
          <p className="text-sm text-muted-foreground">
            Connect a Google Ads or Meta Ads account to start monitoring campaigns.
          </p>
        </div>
        <ClientForm mode="create" />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { PageHeader } from "@/components/shared/PageHeader";
import { LeadsView } from "@/components/leads/LeadsView";
import { LeadSourceNotice } from "@/components/leads/LeadSourceNotice";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <div className="flex flex-col">
      <Header title="Leads" />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 animate-fade-in md:p-8">
        <PageHeader
          title="Leads"
          description="WhatsApp, Meta Lead Form and website enquiries across all clients"
        />
        <LeadSourceNotice />
        <LeadsView />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { PageHeader } from "@/components/shared/PageHeader";
import { AuditSheetsView } from "@/components/audit/AuditSheetsView";

export const metadata: Metadata = { title: "Audit Sheets" };

export default function AuditPage() {
  return (
    <div className="flex flex-col">
      <Header title="Audit Sheets" />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 animate-fade-in md:p-8">
        <PageHeader
          title="Audit Sheets"
          description="Weekly client audit built automatically from Meta / Google Ads and TeleCRM — download it or update the Google Sheet in one click"
        />
        <AuditSheetsView />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { PageLoader } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCampaigns } from "@/hooks/useCampaigns";
import { BarChart3, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CampaignsPage() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<"ALL" | "GOOGLE" | "META">("ALL");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "PAUSED" | "ENDED">("ALL");
  const [page, setPage] = useState(1);

  const { campaigns, total, totalPages, isLoading, error } = useCampaigns({
    platform: platform !== "ALL" ? platform : undefined,
    status: status !== "ALL" ? status : undefined,
    search: search.length > 1 ? search : undefined,
    page,
    pageSize: 25,
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Campaigns" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold">All Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            {total} campaign{total !== 1 ? "s" : ""} across all clients
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>

          <Select value={platform} onValueChange={(v) => { setPlatform(v as typeof platform); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Platforms</SelectItem>
              <SelectItem value="GOOGLE">Google Ads</SelectItem>
              <SelectItem value="META">Meta Ads</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="ENDED">Ended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader text="Loading campaigns..." />
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-4 text-sm text-red-600">
            {error}
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No campaigns found"
            description="Try adjusting your filters or sync your clients to pull campaign data."
          />
        ) : (
          <>
            <CampaignTable
              campaigns={campaigns}
              title="Campaigns"
              description={`Showing ${campaigns.length} of ${total}`}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

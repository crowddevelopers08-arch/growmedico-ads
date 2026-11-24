"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatNumber, cn } from "@/lib/utils";

interface StatusCount { status: string; count: number }

export function TeleCrmStatusPanel({ statuses, total }: { statuses: StatusCount[]; total: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("crmStatus");

  function selectStatus(status: string) {
    const next = new URLSearchParams(params.toString());
    if (selected === status) next.delete("crmStatus");
    else next.set("crmStatus", status);
    router.push(`?${next.toString()}`, { scroll: false });
  }

  return (
    <Card className="p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">TeleCRM Lead Status</h2>
          <p className="text-sm text-muted-foreground">Click a status to view matching lead details below</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
          {formatNumber(total)} leads
        </span>
      </div>
      {statuses.length ? (
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {statuses.map(({ status, count }) => (
            <button
              key={status}
              type="button"
              aria-pressed={selected === status}
              onClick={() => selectStatus(status)}
              className={cn(
                "min-w-0 rounded-md p-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected === status && "bg-primary/10"
              )}
            >
              <span className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium" title={status}>{status}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatNumber(count)}</span>
              </span>
              <Progress value={total ? (count / total) * 100 : 0} className="mt-1.5 h-1.5" />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No TeleCRM lead statuses synced yet.</p>
      )}
    </Card>
  );
}

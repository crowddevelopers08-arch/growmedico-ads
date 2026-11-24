"use client";

import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  calcBudgetUsage,
  getPlatformColor,
  getPlatformLabel,
  cn,
} from "@/lib/utils";
import type { CampaignWithClient } from "@/types";

interface CampaignTableProps {
  campaigns: CampaignWithClient[];
  title?: string;
  description?: string;
  showClientColumn?: boolean;
  compact?: boolean;
  /** Shows a "View all" link in the card header */
  viewAllHref?: string;
}

function usageColor(usage: number) {
  return usage >= 90 ? "red" : usage >= 80 ? "amber" : "primary";
}

export function CampaignTable({
  campaigns,
  title = "Campaigns",
  description,
  showClientColumn = true,
  compact = false,
  viewAllHref,
}: CampaignTableProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </CardHeader>

      {campaigns.length === 0 ? (
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-muted-foreground">
            <BarChart3 className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">No campaigns to show</p>
          </div>
        </CardContent>
      ) : (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="th pl-5">Campaign</th>
                {showClientColumn && <th className="th">Client</th>}
                <th className="th">Status</th>
                <th className="th text-right">Spend</th>
                {!compact && (
                  <>
                    <th className="th text-right">Clicks</th>
                    <th className="th text-right">CTR</th>
                    <th className="th text-right">Conv.</th>
                    <th className="th text-right">CPL</th>
                    <th className="th text-right">CPC</th>
                  </>
                )}
                <th className="th pr-5">Budget used</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((campaign) => {
                const budget =
                  campaign.totalBudget > 0 ? campaign.totalBudget : campaign.dailyBudget;
                const usage = calcBudgetUsage(campaign.spend, budget);
                const color = usageColor(usage);

                return (
                  <tr key={campaign.id} className="transition-colors hover:bg-muted/40">
                    {/* Campaign name + platform */}
                    <td className="max-w-[280px] py-3 pl-5 pr-4">
                      <div className="truncate font-medium" title={campaign.name}>
                        {campaign.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getPlatformColor(campaign.platform) }} />
                        {getPlatformLabel(campaign.platform)}
                      </div>
                    </td>

                    {showClientColumn && (
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/clients/${campaign.client.id}`}
                          className="text-sm font-medium text-foreground/80 hover:text-primary hover:underline"
                        >
                          {campaign.client.name}
                        </Link>
                      </td>
                    )}

                    <td className="px-4 py-3">
                      <StatusBadge status={campaign.status} />
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                      {formatCurrency(campaign.spend)}
                    </td>

                    {!compact && (
                      <>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatNumber(campaign.clicks, true)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right tabular-nums",
                            campaign.ctr > 2
                              ? "text-emerald-600 dark:text-emerald-400"
                              : campaign.ctr < 1
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                          )}
                          title={campaign.ctr > 2 ? "Strong CTR (above 2%)" : campaign.ctr < 1 ? "Weak CTR (below 1%)" : undefined}
                        >
                          {formatPercent(campaign.ctr)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatNumber(campaign.conversions)}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground"
                          title="Cost per lead (spend divided by conversions)"
                        >
                          {campaign.conversions > 0
                            ? formatCurrency(campaign.spend / campaign.conversions)
                            : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatCurrency(campaign.cpc)}
                        </td>
                      </>
                    )}

                    {/* Budget progress */}
                    <td className="min-w-[150px] py-3 pl-4 pr-5">
                      {budget > 0 ? (
                        <div className="space-y-1.5">
                          <div className="flex justify-between gap-2 text-xs">
                            <span className="text-muted-foreground tabular-nums">
                              of {formatCurrency(budget, "INR", true)}
                            </span>
                            <span
                              className={cn(
                                "font-medium tabular-nums",
                                color === "red" && "text-red-600 dark:text-red-400",
                                color === "amber" && "text-amber-600 dark:text-amber-400"
                              )}
                            >
                              {usage}%
                            </span>
                          </div>
                          <Progress
                            value={usage}
                            className={cn(
                              "h-1.5",
                              color === "red" ? "[&>div]:bg-red-500" : color === "amber" ? "[&>div]:bg-amber-500" : "[&>div]:bg-primary"
                            )}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No budget set</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

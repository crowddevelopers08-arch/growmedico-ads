"use client";

import Link from "next/link";
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  calcBudgetUsage,
  getCampaignStatusColor,
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
}

export function CampaignTable({
  campaigns,
  title = "Campaigns",
  description,
  showClientColumn = true,
  compact = false,
}: CampaignTableProps) {
  if (campaigns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8 text-sm">
            No campaigns found.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-6 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Campaign
                </th>
                {showClientColumn && (
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Client
                  </th>
                )}
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Status
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Spend
                </th>
                {!compact && (
                  <>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      Clicks
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      CTR
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      Conv.
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      CPC
                    </th>
                  </>
                )}
                <th className="px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Budget
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((campaign) => {
                const budget =
                  campaign.totalBudget > 0 ? campaign.totalBudget : campaign.dailyBudget;
                const usage = calcBudgetUsage(campaign.spend, budget);
                const isLowBudget = usage >= 80;

                return (
                  <tr
                    key={campaign.id}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    {/* Campaign name */}
                    <td className="px-6 py-3.5 max-w-[200px]">
                      <div className="font-medium truncate" title={campaign.name}>
                        {campaign.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {getPlatformLabel(campaign.platform)}
                      </div>
                    </td>

                    {/* Client */}
                    {showClientColumn && (
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/clients/${campaign.client.id}`}
                          className="text-primary hover:underline text-xs font-medium flex items-center gap-1 group/link"
                        >
                          {campaign.client.name}
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                        </Link>
                      </td>
                    )}

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                          getCampaignStatusColor(campaign.status)
                        )}
                      >
                        {campaign.status}
                      </span>
                    </td>

                    {/* Spend */}
                    <td className="px-4 py-3.5 text-right font-medium tabular-nums">
                      {formatCurrency(campaign.spend)}
                    </td>

                    {!compact && (
                      <>
                        {/* Clicks */}
                        <td className="px-4 py-3.5 text-right text-muted-foreground tabular-nums">
                          {formatNumber(campaign.clicks, true)}
                        </td>

                        {/* CTR */}
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          <div className="flex items-center justify-end gap-1">
                            {campaign.ctr > 2 ? (
                              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                            ) : campaign.ctr < 1 ? (
                              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                            ) : null}
                            <span className={cn(
                              "text-sm",
                              campaign.ctr > 2 ? "text-green-600 dark:text-green-400" :
                              campaign.ctr < 1 ? "text-red-600 dark:text-red-400" :
                              "text-muted-foreground"
                            )}>
                              {formatPercent(campaign.ctr)}
                            </span>
                          </div>
                        </td>

                        {/* Conversions */}
                        <td className="px-4 py-3.5 text-right font-medium tabular-nums">
                          {formatNumber(campaign.conversions)}
                        </td>

                        {/* CPC */}
                        <td className="px-4 py-3.5 text-right text-muted-foreground tabular-nums">
                          {formatCurrency(campaign.cpc)}
                        </td>
                      </>
                    )}

                    {/* Budget progress */}
                    <td className="px-4 py-3.5 min-w-[140px]">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {formatCurrency(campaign.spend, "INR", true)} / {formatCurrency(budget, "INR", true)}
                          </span>
                          <span
                            className={cn(
                              "font-medium",
                              usage >= 90
                                ? "text-red-600 dark:text-red-400"
                                : usage >= 80
                                ? "text-yellow-600 dark:text-yellow-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {usage}%
                          </span>
                        </div>
                        <Progress
                          value={usage}
                          className={cn(
                            "h-1.5",
                            usage >= 90
                              ? "[&>div]:bg-red-500"
                              : usage >= 80
                              ? "[&>div]:bg-yellow-500"
                              : "[&>div]:bg-primary"
                          )}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

import { Wallet } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, calcBudgetUsage, cn } from "@/lib/utils";
import type { Campaign } from "@prisma/client";

interface BudgetProgressProps {
  campaigns: Campaign[];
  title?: string;
  description?: string;
  /** Show at most this many campaigns (highest usage first) */
  maxItems?: number;
}

export function BudgetProgress({
  campaigns,
  title = "Budget Usage",
  description = "Spend vs budget, highest usage first",
  maxItems = 6,
}: BudgetProgressProps) {
  const campaignsWithBudget = campaigns
    .filter((c) => c.totalBudget > 0 || c.dailyBudget > 0)
    .map((c) => {
      const budget = c.totalBudget > 0 ? c.totalBudget : c.dailyBudget;
      return { campaign: c, budget, usage: calcBudgetUsage(c.spend, budget) };
    })
    .sort((a, b) => b.usage - a.usage);

  const visible = campaignsWithBudget.slice(0, maxItems);
  const hidden = campaignsWithBudget.length - visible.length;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {visible.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
            <Wallet className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">No budgets set</p>
          </div>
        ) : (
          <>
            {visible.map(({ campaign, budget, usage }) => {
              const isCritical = usage >= 90;
              const isWarning = usage >= 80 && usage < 90;

              return (
                <div key={campaign.id} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={campaign.name}>{campaign.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(campaign.spend, "INR", true)} of {formatCurrency(budget, "INR", true)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                        isCritical
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : isWarning
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground"
                      )}
                      title={isCritical ? "Critical — over 90% used" : isWarning ? "Low budget — over 80% used" : undefined}
                    >
                      {usage}%
                    </span>
                  </div>
                  <Progress
                    value={usage}
                    className={cn(
                      "h-1.5",
                      isCritical ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-amber-500" : "[&>div]:bg-primary"
                    )}
                  />
                </div>
              );
            })}
            {hidden > 0 && (
              <p className="pt-1 text-xs text-muted-foreground">
                +{hidden} more campaign{hidden !== 1 ? "s" : ""} — see the table below
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

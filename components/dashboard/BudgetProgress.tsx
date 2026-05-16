import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, calcBudgetUsage, cn } from "@/lib/utils";
import type { Campaign } from "@prisma/client";

interface BudgetProgressProps {
  campaigns: Campaign[];
  title?: string;
  description?: string;
}

export function BudgetProgress({
  campaigns,
  title = "Budget Usage",
  description = "Current spend vs total budget per campaign",
}: BudgetProgressProps) {
  const campaignsWithBudget = campaigns
    .filter((c) => c.totalBudget > 0 || c.dailyBudget > 0)
    .sort((a, b) => {
      const budgetA = a.totalBudget > 0 ? a.totalBudget : a.dailyBudget;
      const budgetB = b.totalBudget > 0 ? b.totalBudget : b.dailyBudget;
      const usageA = calcBudgetUsage(a.spend, budgetA);
      const usageB = calcBudgetUsage(b.spend, budgetB);
      return usageB - usageA;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {campaignsWithBudget.length === 0 ? (
          <p className="text-center text-muted-foreground py-4 text-sm">
            No budget data available.
          </p>
        ) : (
          campaignsWithBudget.map((campaign) => {
            const budget =
              campaign.totalBudget > 0 ? campaign.totalBudget : campaign.dailyBudget;
            const usage = calcBudgetUsage(campaign.spend, budget);
            const isCritical = usage >= 90;
            const isWarning = usage >= 80 && usage < 90;

            return (
              <div key={campaign.id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1 mr-4">
                    <p className="font-medium truncate">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(campaign.spend)} of {formatCurrency(budget)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={cn(
                        "text-sm font-bold",
                        isCritical
                          ? "text-red-600 dark:text-red-400"
                          : isWarning
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {usage}%
                    </span>
                    {(isCritical || isWarning) && (
                      <p className="text-[10px] text-right mt-0.5">
                        {isCritical ? (
                          <span className="text-red-500">Critical</span>
                        ) : (
                          <span className="text-yellow-500">Low Budget</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <Progress
                  value={usage}
                  className={cn(
                    "h-2",
                    isCritical
                      ? "[&>div]:bg-red-500"
                      : isWarning
                      ? "[&>div]:bg-yellow-500"
                      : "[&>div]:bg-primary"
                  )}
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

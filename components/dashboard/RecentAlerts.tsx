"use client";

import Link from "next/link";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { AlertWithClient } from "@/types";

interface RecentAlertsProps {
  alerts: AlertWithClient[];
  title?: string;
  description?: string;
  maxItems?: number;
}

export const severityConfig = {
  CRITICAL: { icon: AlertCircle, label: "Critical", textClass: "text-red-600 dark:text-red-400", iconClass: "bg-red-500/10 text-red-600 dark:text-red-400" },
  WARNING: { icon: AlertTriangle, label: "Warning", textClass: "text-amber-600 dark:text-amber-400", iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  INFO: { icon: Info, label: "Info", textClass: "text-blue-600 dark:text-blue-400", iconClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
};

export function RecentAlerts({
  alerts,
  title = "Recent Alerts",
  description = "Unread alerts requiring attention",
  maxItems = 5,
}: RecentAlertsProps) {
  const visibleAlerts = alerts.slice(0, maxItems);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Link
          href="/alerts"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="flex-1">
        {visibleAlerts.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-sm font-medium">All clear</p>
            <p className="text-xs text-muted-foreground">No unread alerts right now</p>
          </div>
        ) : (
          <ul className="-mx-2 space-y-1">
            {visibleAlerts.map((alert) => {
              const config = severityConfig[alert.severity] ?? severityConfig.INFO;
              const SeverityIcon = config.icon;

              return (
                <li key={alert.id} className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.iconClass)}>
                    <SeverityIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-3 break-words text-sm leading-snug" title={alert.message}>{alert.message}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Link href={`/clients/${alert.client.id}`} className="font-medium hover:text-foreground hover:underline">
                        {alert.client.name}
                      </Link>
                      <span aria-hidden>·</span>
                      <span>{formatRelativeTime(alert.createdAt)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

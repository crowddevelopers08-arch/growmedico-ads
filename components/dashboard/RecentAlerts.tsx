"use client";

import Link from "next/link";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, getSeverityColor, cn } from "@/lib/utils";
import type { AlertWithClient } from "@/types";

interface RecentAlertsProps {
  alerts: AlertWithClient[];
  title?: string;
  description?: string;
  maxItems?: number;
}

const severityConfig = {
  CRITICAL: { icon: AlertCircle, className: "text-red-500" },
  WARNING: { icon: AlertTriangle, className: "text-yellow-500" },
  INFO: { icon: Info, className: "text-blue-500" },
};

export function RecentAlerts({
  alerts,
  title = "Recent Alerts",
  description = "Unread alerts requiring attention",
  maxItems = 5,
}: RecentAlertsProps) {
  const visibleAlerts = alerts.slice(0, maxItems);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Link href="/alerts">
          <Button variant="ghost" size="sm" className="text-xs h-8 gap-1">
            View all
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
            <p className="text-sm text-muted-foreground">All clear — no unread alerts</p>
          </div>
        ) : (
          visibleAlerts.map((alert) => {
            const config = severityConfig[alert.severity] ?? severityConfig.INFO;
            const SeverityIcon = config.icon;

            return (
              <div
                key={alert.id}
                className={cn(
                  "flex gap-3 rounded-lg border p-3 text-sm transition-colors",
                  !alert.isRead && "bg-muted/30",
                  getSeverityColor(alert.severity)
                )}
              >
                <SeverityIcon className={cn("h-4 w-4 mt-0.5 shrink-0", config.className)} />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-medium leading-snug text-foreground">{alert.message}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Link
                      href={`/clients/${alert.client.id}`}
                      className="hover:underline font-medium"
                    >
                      {alert.client.name}
                    </Link>
                    <span>•</span>
                    <span>{formatRelativeTime(alert.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

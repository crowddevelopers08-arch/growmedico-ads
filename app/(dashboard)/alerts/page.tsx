"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAlerts } from "@/hooks/useAlerts";
import {
  Bell, AlertTriangle, AlertCircle, Info, CheckCircle2, Link2,
} from "lucide-react";
import { formatRelativeTime, getSeverityColor, cn } from "@/lib/utils";
import Link from "next/link";

const severityConfig = {
  CRITICAL: { icon: AlertCircle, label: "Critical", badgeVariant: "critical" as const },
  WARNING: { icon: AlertTriangle, label: "Warning", badgeVariant: "warning" as const },
  INFO: { icon: Info, label: "Info", badgeVariant: "info" as const },
};

export default function AlertsPage() {
  const [severity, setSeverity] = useState<"ALL" | "CRITICAL" | "WARNING" | "INFO">("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { alerts, total, totalPages, unreadCount, isLoading, error, markAsRead, markAllAsRead } =
    useAlerts({
      severity: severity !== "ALL" ? severity : undefined,
      unreadOnly,
      page,
      pageSize: 20,
    });

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Alerts" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Alert Center</h2>
              {unreadCount > 0 && (
                <Badge variant="critical" className="text-xs">
                  {unreadCount} unread
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {total} alert{total !== 1 ? "s" : ""} total
            </p>
          </div>

          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Mark All as Read
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={severity} onValueChange={(v) => { setSeverity(v as typeof severity); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Severities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="WARNING">Warning</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={unreadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }}
            className="gap-2"
          >
            <Bell className="h-4 w-4" />
            {unreadOnly ? "Showing Unread" : "Show Unread Only"}
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader text="Loading alerts..." />
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-4 text-sm text-red-600">
            {error}
          </div>
        ) : alerts.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly ? "No unread alerts" : "No alerts yet"}
            description={
              unreadOnly
                ? "All alerts have been read. Great job staying on top of things!"
                : "Alerts will appear here when budget thresholds are breached or issues are detected."
            }
          />
        ) : (
          <>
            <div className="space-y-2">
              {alerts.map((alert) => {
                const config = severityConfig[alert.severity] ?? severityConfig.INFO;
                const SeverityIcon = config.icon;

                return (
                  <Card
                    key={alert.id}
                    className={cn(
                      "transition-all",
                      !alert.isRead && "border-l-4",
                      alert.severity === "CRITICAL" && !alert.isRead && "border-l-red-500",
                      alert.severity === "WARNING" && !alert.isRead && "border-l-yellow-500",
                      alert.severity === "INFO" && !alert.isRead && "border-l-blue-500"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          alert.severity === "CRITICAL" && "bg-red-100 dark:bg-red-900/20",
                          alert.severity === "WARNING" && "bg-yellow-100 dark:bg-yellow-900/20",
                          alert.severity === "INFO" && "bg-blue-100 dark:bg-blue-900/20",
                        )}>
                          <SeverityIcon className={cn(
                            "h-4 w-4",
                            alert.severity === "CRITICAL" && "text-red-600",
                            alert.severity === "WARNING" && "text-yellow-600",
                            alert.severity === "INFO" && "text-blue-600",
                          )} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <p className={cn("text-sm font-medium", !alert.isRead && "text-foreground", alert.isRead && "text-muted-foreground")}>
                                {alert.message}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Link
                                  href={`/clients/${alert.client.id}`}
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                  {alert.client.name}
                                  <Link2 className="h-3 w-3" />
                                </Link>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatRelativeTime(alert.createdAt)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant={config.badgeVariant} className="text-xs">
                                {config.label}
                              </Badge>
                              {!alert.isRead && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs"
                                  onClick={() => markAsRead([alert.id])}
                                >
                                  Mark read
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

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

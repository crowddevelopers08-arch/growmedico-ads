"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorMessage } from "@/components/shared/ErrorMessage";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { severityConfig } from "@/components/dashboard/RecentAlerts";
import { useAlerts } from "@/hooks/useAlerts";
import { formatRelativeTime, cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type SeverityFilter = "ALL" | "CRITICAL" | "WARNING" | "INFO";

export default function AlertsPage() {
  const [severity, setSeverity] = useState<SeverityFilter>("ALL");
  const [readFilter, setReadFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [page, setPage] = useState(1);
  const unreadOnly = readFilter === "UNREAD";

  const { alerts, total, totalPages, unreadCount, isLoading, error, markAsRead, markAllAsRead } =
    useAlerts({
      severity: severity !== "ALL" ? severity : undefined,
      unreadOnly,
      page,
      pageSize: PAGE_SIZE,
    });

  return (
    <div className="flex flex-col">
      <Header title="Alerts" />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 animate-fade-in md:p-8">
        <PageHeader
          title="Alerts"
          description={
            unreadCount > 0
              ? `${unreadCount} unread · budget, spend and account issues across clients`
              : "Budget, spend and account issues across clients"
          }
          actions={
            unreadCount > 0 && (
              <Button variant="outline" onClick={() => markAllAsRead()}>
                <CheckCheck />
                Mark all as read
              </Button>
            )
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel="Read status"
            value={readFilter}
            onChange={(v) => { setReadFilter(v); setPage(1); }}
            options={[
              { value: "ALL", label: "All" },
              {
                value: "UNREAD",
                label: (
                  <>
                    Unread
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white tabular-nums">
                        {unreadCount}
                      </span>
                    )}
                  </>
                ),
              },
            ]}
          />
          <SegmentedControl
            ariaLabel="Severity"
            className="max-w-full overflow-x-auto"
            value={severity}
            onChange={(v) => { setSeverity(v); setPage(1); }}
            options={[
              { value: "ALL", label: "All severities" },
              { value: "CRITICAL", label: "Critical" },
              { value: "WARNING", label: "Warning" },
              { value: "INFO", label: "Info" },
            ]}
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader text="Loading alerts..." />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : alerts.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly ? "You're all caught up" : "No alerts yet"}
            description={
              unreadOnly
                ? "There are no unread alerts."
                : "Alerts will appear here when budget thresholds are breached or issues are detected."
            }
          />
        ) : (
          <div className="space-y-4">
            <Card className="divide-y overflow-hidden">
              {alerts.map((alert) => {
                const config = severityConfig[alert.severity] ?? severityConfig.INFO;
                const SeverityIcon = config.icon;

                return (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex gap-4 p-4 transition-colors sm:px-5",
                      !alert.isRead ? "bg-primary/[0.03]" : "opacity-75"
                    )}
                  >
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.iconClass)}>
                      <SeverityIcon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        {!alert.isRead && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                        )}
                        <p className={cn("break-words text-sm", !alert.isRead ? "font-medium" : "text-muted-foreground")}>
                          {alert.message}
                        </p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className={cn("font-medium", config.textClass)}>
                          {config.label}
                        </span>
                        <span aria-hidden>·</span>
                        <Link href={`/clients/${alert.client.id}`} className="font-medium hover:text-foreground hover:underline">
                          {alert.client.name}
                        </Link>
                        <span aria-hidden>·</span>
                        <span>{formatRelativeTime(alert.createdAt)}</span>
                      </div>
                    </div>

                    {!alert.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 self-center text-muted-foreground"
                        onClick={() => markAsRead([alert.id])}
                        title="Mark as read"
                      >
                        <Check />
                        <span className="hidden sm:inline">Mark read</span>
                      </Button>
                    )}
                  </div>
                );
              })}
            </Card>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="alerts"
            />
          </div>
        )}
      </div>
    </div>
  );
}

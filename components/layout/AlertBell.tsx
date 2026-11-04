"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAlerts } from "@/hooks/useAlerts";

export function AlertBell() {
  const { unreadCount, isLoading } = useAlerts({ unreadOnly: true });
  const hasUnread = !isLoading && unreadCount > 0;

  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link href="/alerts" title={hasUnread ? `${unreadCount} unread alerts` : "Alerts"}>
        <Bell />
        {hasUnread && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-background tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        <span className="sr-only">Alerts</span>
      </Link>
    </Button>
  );
}

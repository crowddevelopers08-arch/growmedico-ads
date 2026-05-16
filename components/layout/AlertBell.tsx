"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAlerts } from "@/hooks/useAlerts";

export function AlertBell() {
  const { unreadCount, isLoading } = useAlerts({ unreadOnly: true });

  return (
    <Link href="/alerts">
      <Button variant="ghost" size="icon" className="h-8 w-8 relative">
        <Bell className="h-4 w-4" />
        {!isLoading && unreadCount > 0 && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center",
              "rounded-full bg-red-500 text-[10px] font-bold text-white",
              "ring-2 ring-background animate-pulse"
            )}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        <span className="sr-only">Alerts</span>
      </Button>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { MoreHorizontal, RefreshCw, Edit, Trash2, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, getPlatformLabel, getPlatformColor, cn } from "@/lib/utils";
import type { ClientWithStats } from "@/types";
import { BalanceBlock } from "./BalanceInfo";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface ClientCardProps {
  client: ClientWithStats;
  onDelete?: (id: string) => void;
}

export function ClientCard({ client, onDelete }: ClientCardProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const campaigns = client.campaigns ?? [];
  const alerts = client.alerts ?? [];
  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend ?? 0), 0);
  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;
  const unreadAlerts = client._count?.alerts ?? alerts.filter((a) => !a.isRead).length;
  const platformColor = getPlatformColor(client.platform);
  const initials = client.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSync = async (e: React.MouseEvent) => {
    e.preventDefault();
    setSyncing(true);
    try {
      await fetch(`/api/sync?id=${client.id}`, { method: "POST" });
      router.refresh();
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm(`Are you sure you want to delete ${client.name}? This cannot be undone.`)) return;
    onDelete?.(client.id);
  };

  return (
    <Card className={cn("group flex flex-col transition-all hover:border-primary/30 hover:shadow-md", !client.isActive && "opacity-70")}>
      {/* Header */}
      <div className="flex items-start gap-3 p-5 pb-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: platformColor }}
          aria-hidden
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <Link href={`/clients/${client.id}`} className="block">
            <h3 className="truncate font-semibold transition-colors hover:text-primary" title={client.name}>
              {client.name}
            </h3>
          </Link>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {getPlatformLabel(client.platform)}
            {client.company && <><span aria-hidden>·</span><span className="truncate">{client.company}</span></>}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8 shrink-0 text-muted-foreground" aria-label={`Actions for ${client.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleSync} disabled={syncing}>
              <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Syncing..." : "Sync now"}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/clients/${client.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={handleDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
        <code className="max-w-[160px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" title="Ad account ID">
          {client.accountId}
        </code>
        {!client.isActive && (
          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Inactive
          </span>
        )}
        {unreadAlerts > 0 && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
            {unreadAlerts} alert{unreadAlerts !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Balance */}
      <BalanceBlock client={client} className="border-t px-5 py-3" />

      {/* Metrics */}
      <div className="mt-auto grid grid-cols-2 divide-x border-t bg-muted/30">
        <div className="px-5 py-3">
          <p className="text-[11px] text-muted-foreground">Total spend</p>
          <p className="mt-0.5 font-semibold tabular-nums">{formatCurrency(totalSpend, "INR", true)}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] text-muted-foreground">Active campaigns</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {activeCampaigns}
            <span className="ml-1 text-xs font-normal text-muted-foreground">/ {campaigns.length}</span>
          </p>
        </div>
      </div>

      <Link
        href={`/clients/${client.id}`}
        className="flex items-center justify-between border-t px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-primary"
      >
        View details
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </Card>
  );
}

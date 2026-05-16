"use client";

import Link from "next/link";
import { MoreVertical, RefreshCw, Edit, Trash2, Activity, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <Card className="relative group hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Platform color indicator */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: platformColor }}
      />

      <CardContent className="p-5 pt-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 mr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/clients/${client.id}`}>
                <h3 className="font-semibold text-base hover:text-primary transition-colors line-clamp-1">
                  {client.name}
                </h3>
              </Link>
              {!client.isActive && (
                <Badge variant="outline" className="text-xs">Inactive</Badge>
              )}
            </div>
            {client.company && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{client.company}</p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSync} disabled={syncing}>
                <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
                {syncing ? "Syncing..." : "Sync Now"}
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

        {/* Platform badge */}
        <div className="flex items-center gap-2 mb-4">
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: platformColor }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-white/70" />
            {getPlatformLabel(client.platform)}
          </div>
          <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">
            {client.accountId}
          </code>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <p className="text-lg font-bold">{formatCurrency(totalSpend, "INR", true)}</p>
            <p className="text-[11px] text-muted-foreground">Total Spend</p>
          </div>
          <div className="text-center border-x">
            <div className="flex items-center justify-center gap-1">
              <Activity className="h-3.5 w-3.5 text-green-500" />
              <p className="text-lg font-bold">{activeCampaigns}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">Active</p>
          </div>
          <div className="text-center">
            {unreadAlerts > 0 ? (
              <div className="flex items-center justify-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{unreadAlerts}</p>
              </div>
            ) : (
              <p className="text-lg font-bold">{client._count.alerts}</p>
            )}
            <p className="text-[11px] text-muted-foreground">Alerts</p>
          </div>
        </div>

        {/* View details link */}
        <Link href={`/clients/${client.id}`}>
          <Button variant="outline" size="sm" className="w-full h-8 text-xs">
            View Details
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

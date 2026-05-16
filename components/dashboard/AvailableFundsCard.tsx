"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";

interface AvailableFundsCardProps {
  fallback?: number;
  className?: string;
}

export function AvailableFundsCard({ fallback = 0, className }: AvailableFundsCardProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/balance", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBalance(data.total ?? 0);
      setFetchedAt(data.fetchedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
      setBalance(fallback);
    } finally {
      setLoading(false);
    }
  }, [fallback]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const displayValue = balance !== null ? balance : fallback;

  const timeLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card className={cn("relative overflow-hidden transition-all hover:shadow-md", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">Available Funds</p>
            {loading ? (
              <div className="h-8 w-28 rounded bg-muted animate-pulse mt-1" />
            ) : (
              <p className="text-2xl font-bold tracking-tight truncate">
                {formatCurrency(displayValue, "INR", true)}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <span className={cn("text-xs", error ? "text-yellow-500" : "text-muted-foreground")}>
                {loading
                  ? "Fetching from Meta…"
                  : error
                  ? `Cached · ${error}`
                  : `Live from Meta${timeLabel ? ` · ${timeLabel}` : ""}`}
              </span>
              {!loading && (
                <button
                  onClick={fetchBalance}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Refresh balance"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ml-4 bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400">
            <Wallet className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </Card>
  );
}

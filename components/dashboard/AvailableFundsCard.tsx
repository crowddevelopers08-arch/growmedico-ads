"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import { statIconStyles } from "./StatsCard";

interface AvailableFundsCardProps {
  fallback?: number;
  className?: string;
}

export function AvailableFundsCard({ fallback = 0, className }: AvailableFundsCardProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [totalDue, setTotalDue] = useState(0);
  const [prepaidCount, setPrepaidCount] = useState<number | null>(null);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/balance", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBalance(data.total ?? 0);
      setTotalDue(data.totalDue ?? 0);
      setPrepaidCount((data.clients ?? []).filter((c: { isPrepaid?: boolean | null }) => c.isPrepaid).length);
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
    <Card className={cn("h-full p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", statIconStyles.success)}>
            <Wallet className="h-4 w-4" />
          </div>
          <p className="truncate text-sm font-medium text-muted-foreground">Available Funds</p>
        </div>
        <button
          onClick={fetchBalance}
          disabled={loading}
          className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          title="Refresh balance"
          aria-label="Refresh balance"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {loading && balance === null ? (
        <div className="mt-4 h-7 w-28 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-4 truncate text-[28px] font-semibold leading-none tracking-tight tabular-nums">
          {formatCurrency(displayValue, "INR", true)}
        </p>
      )}

      {!loading && !error && prepaidCount !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          Across {prepaidCount} prepaid account{prepaidCount !== 1 ? "s" : ""}
          {totalDue > 0 && <> · {formatCurrency(totalDue, "INR", true)} due on cards</>}
        </p>
      )}

      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground" title={error ?? undefined}>
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            loading ? "bg-muted-foreground/40" : error ? "bg-amber-500" : "bg-emerald-500"
          )}
        />
        {loading
          ? "Fetching from Meta…"
          : error
          ? "Last synced value · live fetch failed"
          : `Live from Meta${timeLabel ? ` · ${timeLabel}` : ""}`}
      </p>
    </Card>
  );
}

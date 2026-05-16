"use client";

import { useState, useEffect, useCallback } from "react";
import type { AlertWithClient } from "@/types";

interface UseAlertsOptions {
  clientId?: string;
  unreadOnly?: boolean;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  page?: number;
  pageSize?: number;
  autoRefreshInterval?: number; // ms
}

interface UseAlertsReturn {
  alerts: AlertWithClient[];
  unreadCount: number;
  total: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: (clientId?: string) => Promise<void>;
}

export function useAlerts(options: UseAlertsOptions = {}): UseAlertsReturn {
  const {
    clientId,
    unreadOnly,
    severity,
    page = 1,
    pageSize = 20,
    autoRefreshInterval,
  } = options;

  const [alerts, setAlerts] = useState<AlertWithClient[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (clientId) params.set("clientId", clientId);
      if (unreadOnly) params.set("unreadOnly", "true");
      if (severity) params.set("severity", severity);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/alerts?${params}`);
      if (!res.ok) throw new Error("Failed to fetch alerts");

      const json = await res.json();
      setAlerts(json.data ?? []);
      setUnreadCount(json.unreadCount ?? 0);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [clientId, unreadOnly, severity, page, pageSize]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Auto-refresh for unread badge
  useEffect(() => {
    if (!autoRefreshInterval) return;
    const interval = setInterval(fetchAlerts, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [fetchAlerts, autoRefreshInterval]);

  const markAsRead = async (ids: string[]) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertIds: ids }),
    });
    setAlerts((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, isRead: true } : a))
    );
    setUnreadCount((c) => Math.max(0, c - ids.length));
  };

  const markAllAsRead = async (cid?: string) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true, clientId: cid }),
    });
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
    setUnreadCount(0);
  };

  return {
    alerts,
    unreadCount,
    total,
    totalPages,
    isLoading,
    error,
    refetch: fetchAlerts,
    markAsRead,
    markAllAsRead,
  };
}

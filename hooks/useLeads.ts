"use client";

import { useState, useEffect, useCallback } from "react";
import type { LeadWithClient, LeadFilters, LeadSource } from "@/types";

interface UseLeadsOptions extends LeadFilters {
  page?: number;
  pageSize?: number;
}

interface UseLeadsReturn {
  leads: LeadWithClient[];
  total: number;
  totalPages: number;
  countsBySource: Record<LeadSource, number>;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const EMPTY_COUNTS: Record<LeadSource, number> = { WHATSAPP: 0, META_FORM: 0, WEBSITE: 0, MANUAL: 0 };

export function useLeads(options: UseLeadsOptions = {}): UseLeadsReturn {
  const { clientId, source, crmStatus, from, to, search, page = 1, pageSize = 25 } = options;

  const [leads, setLeads] = useState<LeadWithClient[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [countsBySource, setCountsBySource] = useState(EMPTY_COUNTS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (clientId) params.set("clientId", clientId);
      if (source) params.set("source", source);
      if (crmStatus) params.set("crmStatus", crmStatus);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error("Failed to fetch leads");

      const json = await res.json();
      setLeads(json.data ?? []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 0);
      setCountsBySource(json.countsBySource ?? EMPTY_COUNTS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [clientId, source, crmStatus, from, to, search, page, pageSize]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Sync pulls new Meta lead form submissions
  useEffect(() => {
    window.addEventListener("adpulse:synced", fetchLeads);
    return () => window.removeEventListener("adpulse:synced", fetchLeads);
  }, [fetchLeads]);

  return { leads, total, totalPages, countsBySource, isLoading, error, refetch: fetchLeads };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import type { CampaignWithClient, CampaignFilters } from "@/types";

interface UseCampaignsOptions extends CampaignFilters {
  page?: number;
  pageSize?: number;
}

interface UseCampaignsReturn {
  campaigns: CampaignWithClient[];
  total: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCampaigns(options: UseCampaignsOptions = {}): UseCampaignsReturn {
  const { clientId, platform, status, search, page = 1, pageSize = 20 } = options;

  const [campaigns, setCampaigns] = useState<CampaignWithClient[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (clientId) params.set("clientId", clientId);
      if (platform) params.set("platform", platform);
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/campaigns?${params}`);
      if (!res.ok) throw new Error("Failed to fetch campaigns");

      const json = await res.json();
      setCampaigns(json.data ?? []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [clientId, platform, status, search, page, pageSize]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  return {
    campaigns,
    total,
    totalPages,
    isLoading,
    error,
    refetch: fetchCampaigns,
  };
}

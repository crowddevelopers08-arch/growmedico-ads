"use client";

import { useState, useEffect, useCallback } from "react";
import type { ClientWithStats } from "@/types";

interface UseClientsOptions {
  platform?: "GOOGLE" | "META";
  isActive?: boolean;
  search?: string;
}

interface UseClientsReturn {
  clients: ClientWithStats[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  deleteClient: (id: string) => Promise<void>;
}

export function useClients(options: UseClientsOptions = {}): UseClientsReturn {
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.platform) params.set("platform", options.platform);
      if (options.isActive !== undefined) params.set("isActive", String(options.isActive));
      if (options.search) params.set("search", options.search);

      const res = await fetch(`/api/clients?${params}`);
      if (!res.ok) throw new Error("Failed to fetch clients");

      const json = await res.json();
      setClients(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [options.platform, options.isActive, options.search]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const deleteClient = async (id: string) => {
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? "Failed to delete client");
    }
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  return {
    clients,
    isLoading,
    error,
    refetch: fetchClients,
    deleteClient,
  };
}

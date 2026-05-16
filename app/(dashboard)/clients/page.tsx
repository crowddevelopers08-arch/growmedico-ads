"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Filter } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClientCard } from "@/components/clients/ClientCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageLoader } from "@/components/shared/LoadingSpinner";
import { useClients } from "@/hooks/useClients";
import { Users } from "lucide-react";
import type { ClientWithStats } from "@/types";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"ALL" | "GOOGLE" | "META">("ALL");

  const { clients, isLoading, error, deleteClient } = useClients({
    platform: platformFilter !== "ALL" ? platformFilter : undefined,
    search: search.length > 1 ? search : undefined,
  });

  const handleDelete = async (id: string) => {
    try {
      await deleteClient(id);
    } catch (err) {
      console.error(err);
      alert("Failed to delete client.");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Clients" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-fade-in">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Client Accounts</h2>
            <p className="text-sm text-muted-foreground">
              {clients.length} client{clients.length !== 1 ? "s" : ""} connected
            </p>
          </div>
          <Link href="/clients/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Client
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select
              value={platformFilter}
              onValueChange={(v) => setPlatformFilter(v as typeof platformFilter)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Platforms</SelectItem>
                <SelectItem value="GOOGLE">Google Ads</SelectItem>
                <SelectItem value="META">Meta Ads</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader text="Loading clients..." />
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add your first client to start monitoring their ad campaigns."
            action={{ label: "Add Client", href: "/clients/new" }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client as ClientWithStats}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

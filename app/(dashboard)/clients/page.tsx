"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Plus, Search, Users } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClientCard } from "@/components/clients/ClientCard";
import { ImportMetaDialog } from "@/components/clients/ImportMetaDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorMessage } from "@/components/shared/ErrorMessage";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageLoader } from "@/components/shared/LoadingSpinner";
import { useClients } from "@/hooks/useClients";
import type { ClientWithStats } from "@/types";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"ALL" | "GOOGLE" | "META">("ALL");
  const [importOpen, setImportOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"balance" | "name" | "spend">("balance");

  const { clients, isLoading, error, deleteClient, refetch } = useClients({
    platform: platformFilter !== "ALL" ? platformFilter : undefined,
    search: search.length > 1 ? search : undefined,
  });

  const isFiltered = search.length > 1 || platformFilter !== "ALL";

  const sortedClients = useMemo(() => {
    const list = [...clients] as ClientWithStats[];
    const spend = (c: ClientWithStats) => (c.campaigns ?? []).reduce((s, x) => s + (x.spend ?? 0), 0);
    if (sortBy === "balance") {
      // Prepaid accounts by balance ascending; postpaid / unknown after them
      const key = (c: ClientWithStats) => (c.isPrepaid ? c.balance : Number.POSITIVE_INFINITY);
      list.sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
    } else if (sortBy === "spend") {
      list.sort((a, b) => spend(b) - spend(a));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [clients, sortBy]);

  const handleDelete = async (id: string) => {
    try {
      await deleteClient(id);
    } catch (err) {
      console.error(err);
      alert("Failed to delete client.");
    }
  };

  return (
    <div className="flex flex-col">
      <Header title="Clients" />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 animate-fade-in md:p-8">
        <PageHeader
          title="Clients"
          description={
            isLoading
              ? "Loading accounts…"
              : `${clients.length} ${isFiltered ? "matching" : "connected"} account${clients.length !== 1 ? "s" : ""}`
          }
          actions={
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Download />
                Import from Meta
              </Button>
              <Button asChild>
                <Link href="/clients/new">
                  <Plus />
                  Add client
                </Link>
              </Button>
            </>
          }
        />

        <ImportMetaDialog open={importOpen} onOpenChange={setImportOpen} onImported={refetch} />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-card pl-9"
            />
          </div>
          <Select
            value={platformFilter}
            onValueChange={(v) => setPlatformFilter(v as typeof platformFilter)}
          >
            <SelectTrigger className="bg-card sm:w-[170px]">
              <SelectValue placeholder="All platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All platforms</SelectItem>
              <SelectItem value="GOOGLE">Google Ads</SelectItem>
              <SelectItem value="META">Meta Ads</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="bg-card sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balance">Sort: Lowest balance</SelectItem>
              <SelectItem value="spend">Sort: Highest spend</SelectItem>
              <SelectItem value="name">Sort: Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader text="Loading clients..." />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : clients.length === 0 ? (
          isFiltered ? (
            <EmptyState
              icon={Search}
              title="No clients match your filters"
              description="Try a different search term or platform."
              action={{ label: "Clear filters", onClick: () => { setSearch(""); setPlatformFilter("ALL"); } }}
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No clients yet"
              description="Add your first client to start monitoring their ad campaigns."
              action={{ label: "Add client", href: "/clients/new" }}
            />
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {sortedClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

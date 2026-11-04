"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/shared/ErrorMessage";
import { cn } from "@/lib/utils";

interface AdAccountRow {
  accountId: string;
  name: string;
  accountStatus: number;
  currency: string;
  businessName: string | null;
  existingClient: { id: string; name: string } | null;
}

interface ImportMetaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful import so the list can refresh */
  onImported: () => void;
}

export function ImportMetaDialog({ open, onOpenChange, onImported }: ImportMetaDialogProps) {
  const [accounts, setAccounts] = useState<AdAccountRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load accounts each time the dialog opens; pre-select everything not yet imported
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    setSearch("");
    fetch("/api/clients/import-meta", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        const rows: AdAccountRow[] = json.data;
        setAccounts(rows);
        setSelected(new Set(rows.filter((r) => !r.existingClient).map((r) => r.accountId)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load ad accounts"))
      .finally(() => setLoading(false));
  }, [open]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? accounts.filter((a) => a.name.toLowerCase().includes(q) || a.accountId.includes(q)) : accounts;
  }, [accounts, search]);

  const importable = visible.filter((a) => !a.existingClient);
  const allVisibleSelected = importable.length > 0 && importable.every((a) => selected.has(a.accountId));
  const newCount = accounts.filter((a) => !a.existingClient).length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of importable) {
        if (allVisibleSelected) next.delete(a.accountId);
        else next.add(a.accountId);
      }
      return next;
    });

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      setStatus("Adding clients…");
      const res = await fetch("/api/clients/import-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const created: { id: string }[] = json.data;

      // Pull campaigns for the new clients so they aren't empty on arrival
      for (let i = 0; i < created.length; i++) {
        setStatus(`Syncing campaigns ${i + 1} of ${created.length}…`);
        await fetch(`/api/sync?id=${created[i].id}`, { method: "POST" }).catch(() => undefined);
      }

      onImported();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      setStatus(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !importing && onOpenChange(o)}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="space-y-1 border-b p-5">
          <DialogTitle>Import clients from Meta</DialogTitle>
          <DialogDescription>
            {loading
              ? "Looking up ad accounts for the shared access token…"
              : `${accounts.length} ad account${accounts.length !== 1 ? "s" : ""} found · ${newCount} not yet added`}
          </DialogDescription>
        </DialogHeader>

        {error && <div className="p-5 pb-0"><ErrorMessage message={error} /></div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Loading ad accounts…
          </div>
        ) : accounts.length > 0 && (
          <>
            <div className="flex items-center gap-3 border-b px-5 py-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter accounts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-9"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={toggleAll} disabled={importable.length === 0}>
                {allVisibleSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>

            <ul className="flex-1 divide-y overflow-y-auto">
              {visible.map((a) => {
                const added = !!a.existingClient;
                const checked = added || selected.has(a.accountId);
                return (
                  <li key={a.accountId}>
                    <label
                      className={cn(
                        "flex items-center gap-3 px-5 py-3 transition-colors",
                        added ? "cursor-default opacity-60" : "cursor-pointer hover:bg-muted/50"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-primary"
                        checked={checked}
                        disabled={added || importing}
                        onChange={() => toggle(a.accountId)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {a.accountId} · {a.currency}
                        </p>
                      </div>
                      {added ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title={`Already added as "${a.existingClient!.name}"`}>
                          <Check className="h-3.5 w-3.5 text-emerald-500" /> Added
                        </span>
                      ) : a.accountStatus !== 1 ? (
                        <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          Not active
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
              {visible.length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-muted-foreground">No accounts match “{search}”.</li>
              )}
            </ul>
          </>
        )}

        <DialogFooter className="flex-row items-center gap-2 border-t p-4 sm:justify-between">
          <p className="hidden text-sm text-muted-foreground sm:block">
            {status ?? `${selected.size} selected`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing || loading || selected.size === 0}>
              {importing ? <Loader2 className="animate-spin" /> : <Download />}
              {importing ? "Importing…" : `Import ${selected.size || ""} client${selected.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

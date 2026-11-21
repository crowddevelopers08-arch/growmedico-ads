"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientOption {
  id: string;
  name: string;
}

interface ClientSelectProps {
  clients: ClientOption[];
  /** Client id, or "ALL" for no filter. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Searchable client filter: "All clients" plus every client, filterable by typing. */
export function ClientSelect({ clients, value, onChange, className }: ClientSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
    return [{ id: "ALL", name: "All clients" }, ...matches];
  }, [clients, query]);

  const selectedLabel = value === "ALL" ? "All clients" : clients.find((c) => c.id === value)?.name ?? "Client";

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Reset search and focus the input each time it opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(Math.max(0, [{ id: "ALL" }, ...clients].findIndex((c) => c.id === value)));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted row visible.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[active];
      if (opt) choose(opt.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search clients…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto p-1">
            {options.map((c, i) => (
              <div
                key={c.id}
                role="option"
                aria-selected={c.id === value}
                data-index={i}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c.id)}
                className={cn(
                  "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm",
                  i === active && "bg-accent text-accent-foreground"
                )}
              >
                <span className="truncate">{c.name}</span>
                {c.id === value && <Check className="absolute right-2 h-4 w-4" />}
              </div>
            ))}
            {options.length === 1 && query && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No clients match “{query}”</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

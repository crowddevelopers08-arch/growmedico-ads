"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PRESETS = [
  ["TODAY", "Today"],
  ["YESTERDAY", "Yesterday"],
  ["LAST_7", "Last 7 days"],
  ["THIS_WEEK", "This week"],
  ["LAST_30", "Last 30 days"],
  ["THIS_MONTH", "This month"],
  ["LAST_MONTH", "Last month"],
  ["CUSTOM", "Custom range"],
  ["ALL", "All time"],
] as const;

export function ClientDateFilter() {
  const router = useRouter();
  const params = useSearchParams();
  const [preset, setPreset] = useState(params.get("range") ?? "LAST_30");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  function apply() {
    const next = new URLSearchParams();
    next.set("range", preset);
    if (preset === "CUSTOM") {
      if (from) next.set("from", from);
      if (to) next.set("to", to);
    }
    router.push(`?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={setPreset}>
        <SelectTrigger className="w-[170px] bg-card"><SelectValue /></SelectTrigger>
        <SelectContent>{PRESETS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
      </Select>
      {preset === "CUSTOM" && <>
        <Input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[155px] bg-card" />
        <span className="text-sm text-muted-foreground">to</span>
        <Input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[155px] bg-card" />
      </>}
      <Button variant="outline" onClick={apply}>Apply dates</Button>
    </div>
  );
}

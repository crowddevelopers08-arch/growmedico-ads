"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SyncButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Sync a single client; omit to sync every active client */
  clientId?: string;
  label?: string;
}

/** Triggers /api/sync and refreshes server data in place (no full page reload). */
export function SyncButton({ clientId, label = "Sync now", className, ...props }: SyncButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");

  const handleSync = async () => {
    setState("syncing");
    try {
      const res = await fetch(clientId ? `/api/sync?id=${clientId}` : "/api/sync", { method: "POST" });
      setState(res.ok ? "done" : "error");
      router.refresh();
      // Client-side data hooks (e.g. useLeads) listen for this to refetch
      window.dispatchEvent(new Event("adpulse:synced"));
    } catch {
      setState("error");
    } finally {
      setTimeout(() => setState("idle"), 2500);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleSync}
      disabled={state === "syncing"}
      className={cn(state === "error" && "text-red-600 dark:text-red-400", className)}
      {...props}
    >
      {state === "done" ? (
        <Check className="text-emerald-500" />
      ) : (
        <RefreshCw className={cn(state === "syncing" && "animate-spin")} />
      )}
      {state === "syncing" ? "Syncing…" : state === "done" ? "Synced" : state === "error" ? "Sync failed" : label}
    </Button>
  );
}

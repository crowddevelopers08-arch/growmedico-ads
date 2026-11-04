"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetaLeadStatus {
  ok: boolean;
  reason?: "no_token" | "missing_permission" | "no_pages" | "check_failed";
  granted?: string[];
  message?: string;
}

/**
 * Explains why Meta Lead Form leads aren't arriving when the shared token
 * can't read them. Renders nothing when everything is fine.
 */
export function LeadSourceNotice() {
  const [status, setStatus] = useState<MetaLeadStatus | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetch("/api/leads/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setStatus(json?.metaLeads ?? null))
      .catch(() => undefined);
  }, []);

  // A failed check is usually the flaky network — don't alarm on it
  if (!status || status.ok || status.reason === "check_failed") return null;

  const title =
    status.reason === "no_token"
      ? "Meta Lead Form leads can't be fetched — no Meta access token is configured"
      : status.reason === "no_pages"
      ? "Meta Lead Form leads can't be fetched — the access token can't see any Facebook Pages"
      : "Meta Lead Form leads can't be fetched — the access token is missing the leads permission";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={expanded}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1 font-medium">{title}</span>
        <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="space-y-3 px-4 pb-4 pl-11">
          {status.reason === "no_pages" && (
            <p>
              The token has the right permissions, but lead forms belong to Facebook <strong>Pages</strong> and this
              token&apos;s user has access to <strong>0 Pages</strong> — so Meta returns no leads. Give the user access to
              each client Page, then generate a new token and <strong>tick those Pages</strong> when Facebook asks which
              Pages to allow.
            </p>
          )}
          {status.reason === "missing_permission" && (
            <p>
              Meta only returns lead form submissions to tokens with <code className="rounded bg-amber-500/15 px-1">leads_retrieval</code>.
              This token has: {status.granted?.join(", ") || "no permissions"}.
            </p>
          )}
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              In <strong>Meta Business Settings → Users → System users</strong>, select (or create) a system user.
            </li>
            <li>
              <strong>Assign assets</strong>: every client <strong>Page</strong> running lead forms (with leads access) and every <strong>ad account</strong>.
            </li>
            <li>
              <strong>Generate new token</strong> with: <code className="rounded bg-amber-500/15 px-1">ads_read</code>,{" "}
              <code className="rounded bg-amber-500/15 px-1">leads_retrieval</code>,{" "}
              <code className="rounded bg-amber-500/15 px-1">pages_show_list</code>,{" "}
              <code className="rounded bg-amber-500/15 px-1">pages_read_engagement</code>,{" "}
              <code className="rounded bg-amber-500/15 px-1">pages_manage_ads</code>,{" "}
              <code className="rounded bg-amber-500/15 px-1">business_management</code>.
            </li>
            <li>
              Put it in <code className="rounded bg-amber-500/15 px-1">META_ACCESS_TOKEN</code> in <code className="rounded bg-amber-500/15 px-1">.env</code>, restart the server, then click <strong>Sync all</strong>. Leads from the last 90 days will be pulled in.
            </li>
          </ol>
          <p className="text-xs opacity-80">
            WhatsApp and Website leads arrive separately — your WhatsApp tool or website form has to post them to{" "}
            <code className="rounded bg-amber-500/15 px-1">/api/leads/ingest</code>.
          </p>
        </div>
      )}
    </div>
  );
}

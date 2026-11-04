import { CreditCard, Wallet } from "lucide-react";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";

/** Prepaid balance below these (₹) is flagged so it can be topped up before ads stop. */
export const LOW_BALANCE_WARNING = 3000;
export const LOW_BALANCE_CRITICAL = 1000;

export interface BalanceFields {
  platform: string;
  balance: number;
  isPrepaid: boolean | null;
  amountDue: number;
  fundingLabel: string | null;
  balanceUpdatedAt: Date | string | null;
}

export type BalanceTone = "critical" | "warning" | "ok" | "postpaid" | "unknown";

export function getBalanceTone(c: BalanceFields): BalanceTone {
  if (c.platform !== "META" || c.isPrepaid === null) return "unknown";
  if (!c.isPrepaid) return "postpaid";
  if (c.balance < LOW_BALANCE_CRITICAL) return "critical";
  if (c.balance < LOW_BALANCE_WARNING) return "warning";
  return "ok";
}

export const balanceToneClass: Record<BalanceTone, string> = {
  critical: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  ok: "text-foreground",
  postpaid: "text-foreground",
  unknown: "text-muted-foreground",
};

/** One-line explanation under the amount, e.g. "Prepaid · low balance". */
export function balanceCaption(c: BalanceFields): string {
  const tone = getBalanceTone(c);
  if (tone === "unknown") return c.platform === "META" ? "Not fetched yet — run a sync" : "Not available for Google Ads";
  if (tone === "postpaid") return `Postpaid · ${c.fundingLabel ?? "card / invoice"}`;
  if (tone === "critical") return "Prepaid · top up now";
  if (tone === "warning") return "Prepaid · running low";
  return "Prepaid";
}

/** Main figure: available funds for prepaid, amount due for postpaid. */
export function balanceValue(c: BalanceFields, compact = false): string {
  const tone = getBalanceTone(c);
  if (tone === "unknown") return "—";
  if (tone === "postpaid") return formatCurrency(c.amountDue, "INR", compact);
  return formatCurrency(c.balance, "INR", compact);
}

export function balanceLabel(c: BalanceFields): string {
  return getBalanceTone(c) === "postpaid" ? "Amount due" : "Balance";
}

/** Compact block used on client cards. */
export function BalanceBlock({ client, className }: { client: BalanceFields; className?: string }) {
  const tone = getBalanceTone(client);
  const Icon = tone === "postpaid" ? CreditCard : Wallet;
  const updated = client.balanceUpdatedAt ? `Updated ${formatRelativeTime(client.balanceUpdatedAt)}` : undefined;

  return (
    <div className={cn("flex items-center gap-3", className)} title={updated}>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          tone === "critical" ? "bg-red-500/10 text-red-600 dark:text-red-400"
            : tone === "warning" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : tone === "unknown" ? "bg-muted text-muted-foreground"
            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{balanceLabel(client)}</p>
        <p className={cn("text-lg font-semibold leading-tight tabular-nums", balanceToneClass[tone])}>
          {balanceValue(client)}
        </p>
      </div>
      <p className={cn("max-w-[45%] truncate text-right text-[11px]", tone === "critical" || tone === "warning" ? balanceToneClass[tone] : "text-muted-foreground")}>
        {balanceCaption(client)}
      </p>
    </div>
  );
}

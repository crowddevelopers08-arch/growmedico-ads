import Link from "next/link";
import { Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  balanceCaption, balanceToneClass, balanceValue, getBalanceTone,
  type BalanceFields, type BalanceTone,
} from "@/components/clients/BalanceInfo";
import { cn, formatRelativeTime, getPlatformColor } from "@/lib/utils";

type ClientBalance = BalanceFields & { id: string; name: string };

// Lowest prepaid balances first (they need topping up), then postpaid, then unknown
const toneOrder: Record<BalanceTone, number> = { critical: 0, warning: 1, ok: 2, postpaid: 3, unknown: 4 };

export function AccountBalances({ clients }: { clients: ClientBalance[] }) {
  const rows = [...clients].sort((a, b) => {
    const ta = toneOrder[getBalanceTone(a)];
    const tb = toneOrder[getBalanceTone(b)];
    if (ta !== tb) return ta - tb;
    return ta <= 2 ? a.balance - b.balance : b.amountDue - a.amountDue;
  });
  const lowCount = rows.filter((c) => ["critical", "warning"].includes(getBalanceTone(c))).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Account Balances</CardTitle>
          <CardDescription>
            {lowCount > 0
              ? `${lowCount} prepaid account${lowCount !== 1 ? "s" : ""} running low — lowest first`
              : "Every client's ad account, lowest prepaid balance first"}
          </CardDescription>
        </div>
      </CardHeader>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t py-10 text-muted-foreground">
          <Wallet className="h-8 w-8 opacity-40" />
          <p className="text-sm font-medium">No active clients</p>
        </div>
      ) : (
        <div className="max-h-[420px] overflow-auto border-t">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b bg-muted/40">
                <th className="th pl-5">Client</th>
                <th className="th">Funding</th>
                <th className="th text-right">Balance / due</th>
                <th className="th pr-5 text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => {
                const tone = getBalanceTone(c);
                return (
                  <tr key={c.id} className="transition-colors hover:bg-muted/40">
                    <td className="max-w-[240px] py-2.5 pl-5 pr-4">
                      <Link href={`/clients/${c.id}`} className="flex items-center gap-2 font-medium hover:text-primary hover:underline">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getPlatformColor(c.platform) }} />
                        <span className="truncate">{c.name}</span>
                      </Link>
                    </td>
                    <td className={cn("whitespace-nowrap px-4 py-2.5 text-xs", ["critical", "warning"].includes(tone) ? balanceToneClass[tone] : "text-muted-foreground")}>
                      {balanceCaption(c)}
                    </td>
                    <td className={cn("whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums", balanceToneClass[tone])}>
                      {balanceValue(c)}
                      {tone === "postpaid" && <span className="ml-1 text-xs font-normal text-muted-foreground">due</span>}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-4 pr-5 text-right text-xs text-muted-foreground">
                      {c.balanceUpdatedAt ? formatRelativeTime(c.balanceUpdatedAt) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

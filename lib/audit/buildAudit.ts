/**
 * Builds the weekly client audit (the "PM Audit Sheet") from synced data:
 *   • ad metrics per campaign per day   → Campaign.dailyStats (Meta / Google sync)
 *   • CRM leads and their pipeline stage → Lead rows synced from TeleCRM
 * Leads are matched to campaigns by name within the client; anything that
 * doesn't match a campaign lands in an "Other / unmatched" row so totals add up.
 */

import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bucketForStatus, type StatusBucket } from "./statusBuckets";

export interface AuditMetrics {
  budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  /** null when the client has no TeleCRM connected */
  crm: Record<StatusBucket | "total", number> | null;
}

export interface AuditRow extends AuditMetrics {
  channel: "Meta" | "Google" | "CRM";
  campaign: string;
}

export interface AuditBlock {
  from: string; // YYYY-MM-DD
  to: string;
  rows: AuditRow[];
  totals: Record<"Meta" | "Google", AuditMetrics | null>;
}

export interface ClientAudit {
  clientId: string;
  name: string;
  platform: "META" | "GOOGLE";
  hasCrm: boolean;
  lastSynced: string | null;
  blocks: AuditBlock[]; // newest first
}

export interface AuditOptions {
  from: string;
  to: string;
  clientIds?: string[];
  /** Split the range into 7-day blocks (one per week) instead of a single block. */
  weekly?: boolean;
}

type DailyStat = { date: string; spend?: number; clicks?: number; impressions?: number; conversions?: number };

const emptyCrm = (): Record<StatusBucket | "total", number> => ({
  total: 0, visited: 0, apptBooked: 0, interested: 0, rnr: 0,
  notInterested: 0, outOfLocation: 0, invalid: 0, fresh: 0,
});

const emptyMetrics = (hasCrm: boolean): AuditMetrics => ({
  budget: 0, spend: 0, impressions: 0, clicks: 0, leads: 0, crm: hasCrm ? emptyCrm() : null,
});

function addInto(target: AuditMetrics, src: AuditMetrics) {
  target.budget += src.budget;
  target.spend += src.spend;
  target.impressions += src.impressions;
  target.clicks += src.clicks;
  target.leads += src.leads;
  if (target.crm && src.crm) for (const k of Object.keys(src.crm) as (keyof typeof src.crm)[]) target.crm[k] += src.crm[k];
}

export function splitRange(from: string, to: string, weekly: boolean): { from: string; to: string }[] {
  if (!weekly) return [{ from, to }];
  const out: { from: string; to: string }[] = [];
  let start = parseISO(from);
  const end = parseISO(to);
  while (differenceInCalendarDays(end, start) >= 0) {
    const blockEnd = addDays(start, 6) > end ? end : addDays(start, 6);
    out.push({ from: format(start, "yyyy-MM-dd"), to: format(blockEnd, "yyyy-MM-dd") });
    start = addDays(blockEnd, 1);
  }
  return out.reverse();
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Row label for CRM leads that don't match a synced campaign of the client. */
function unmatchedLabel(source: string, campaign: string | null): string {
  switch (source) {
    case "MANUAL": return "CRM only — calls / walk-ins (added manually)";
    case "WEBSITE": return "CRM only — website forms";
    case "WHATSAPP": return "CRM only — WhatsApp";
    default:
      return campaign?.trim()
        ? `Not in this ad account — ${campaign.trim()}`
        : "CRM only — Meta form (campaign unknown)";
  }
}

export async function buildAudit({ from, to, clientIds, weekly = true }: AuditOptions): Promise<ClientAudit[]> {
  const ranges = splitRange(from, to, weekly);
  const blockOf = (date: string) => ranges.findIndex((r) => date >= r.from && date <= r.to);

  const clients = await prisma.client.findMany({
    where: clientIds?.length ? { id: { in: clientIds } } : { isActive: true },
    select: {
      id: true, name: true, platform: true, telecrmEnterpriseId: true,
      campaigns: {
        select: { name: true, platform: true, dailyBudget: true, dailyStats: true, lastSynced: true },
      },
    },
    orderBy: { name: "asc" },
  });
  if (clients.length === 0) return [];

  // CRM leads per client / campaign / IST day / stage
  const leadRows = await prisma.$queryRaw<
    { clientId: string; campaign: string | null; source: string; day: string; crmStatus: string | null; n: bigint }[]
  >`
    SELECT "clientId", "campaign", "source"::text AS source,
      to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
      "crmStatus", COUNT(*) AS n
    FROM "leads"
    WHERE "crmId" IS NOT NULL
      AND "clientId" IN (${Prisma.join(clients.map((c) => c.id))})
      AND "createdAt" >= (${from}::date - interval '1 day')
      AND "createdAt" <  (${to}::date + interval '2 day')
    GROUP BY 1, 2, 3, 4, 5
  `;

  const leadsByClient = new Map<string, typeof leadRows>();
  for (const r of leadRows) leadsByClient.set(r.clientId, [...(leadsByClient.get(r.clientId) ?? []), r]);

  return clients.map((client) => {
    const hasCrm = Boolean(client.telecrmEnterpriseId);
    // block index → campaign key → row
    const blocks = ranges.map(() => new Map<string, AuditRow>());
    const lastSynced = client.campaigns.reduce<Date | null>(
      (max, c) => (!max || c.lastSynced > max ? c.lastSynced : max), null
    );

    const nameToKey = new Map<string, string>();
    for (const c of client.campaigns) {
      const key = `${c.platform}:${norm(c.name)}`;
      nameToKey.set(norm(c.name), key);
      const stats = Array.isArray(c.dailyStats) ? (c.dailyStats as DailyStat[]) : [];
      for (const d of stats) {
        const b = blockOf(d.date);
        if (b < 0) continue;
        let row = blocks[b].get(key);
        if (!row) {
          row = { channel: c.platform === "GOOGLE" ? "Google" : "Meta", campaign: c.name, ...emptyMetrics(hasCrm) };
          row.budget = c.dailyBudget || 0;
          blocks[b].set(key, row);
        }
        row.spend += Number(d.spend) || 0;
        row.impressions += Number(d.impressions) || 0;
        row.clicks += Number(d.clicks) || 0;
        row.leads += Number(d.conversions) || 0;
      }
    }

    if (hasCrm) {
      for (const l of leadsByClient.get(client.id) ?? []) {
        const b = blockOf(l.day);
        if (b < 0) continue;
        const label = unmatchedLabel(l.source, l.campaign);
        const key = nameToKey.get(norm(l.campaign)) ?? `CRM:${label.toLowerCase()}`;
        let row = blocks[b].get(key);
        if (!row) {
          const matched = client.campaigns.find((c) => `${c.platform}:${norm(c.name)}` === key);
          row = matched
            ? { channel: matched.platform === "GOOGLE" ? "Google" : "Meta", campaign: matched.name, ...emptyMetrics(true) }
            : { channel: "CRM", campaign: label, ...emptyMetrics(true) };
          if (matched) row.budget = matched.dailyBudget || 0;
          blocks[b].set(key, row);
        }
        const n = Number(l.n);
        row.crm!.total += n;
        row.crm![bucketForStatus(l.crmStatus)] += n;
      }
    }

    const order = { Meta: 0, Google: 1, CRM: 2 };
    const auditBlocks: AuditBlock[] = ranges.map((r, i) => {
      const rows = [...blocks[i].values()]
        .filter((row) => row.spend > 0 || row.impressions > 0 || row.leads > 0 || (row.crm?.total ?? 0) > 0)
        .sort((a, b) => order[a.channel] - order[b.channel] || b.spend - a.spend);
      const totals: AuditBlock["totals"] = { Meta: null, Google: null };
      for (const row of rows) {
        if (row.channel === "CRM") continue;
        addInto((totals[row.channel] ??= emptyMetrics(hasCrm)), row);
      }
      return { from: r.from, to: r.to, rows, totals };
    });

    return {
      clientId: client.id,
      name: client.name,
      platform: client.platform,
      hasCrm,
      lastSynced: lastSynced?.toISOString() ?? null,
      blocks: auditBlocks,
    };
  });
}

/** Totals for a whole block (all channels + unmatched CRM leads). */
export function blockTotal(block: AuditBlock, hasCrm: boolean): AuditMetrics {
  const t = emptyMetrics(hasCrm);
  for (const row of block.rows) addInto(t, row);
  return t;
}

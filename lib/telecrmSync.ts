/**
 * AdPulse — TeleCRM lead sync
 *
 * Each client can carry a TeleCRM enterprise ID + Sync token. Clients sharing an
 * enterprise ID (e.g. several branch ad accounts of one clinic) are synced as one
 * TeleCRM account, and each lead is routed to a client:
 *   1. a lead already stored (same Facebook lead ID) keeps its client;
 *   2. otherwise its Facebook campaign name is matched to that client's campaigns;
 *   3. otherwise it goes to the oldest client in the group.
 */

import { randomUUID } from "crypto";
import { Prisma, type LeadSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  fetchTeleCrmOrigin,
  iterateTeleCrmLeads,
  normalizeTeleCrmLead,
  quickTeleCrmSource,
  sourceFromOrigin,
  type NormalizedTeleCrmLead,
  type TeleCrmLead,
  type TeleCrmOrigin,
} from "@/lib/telecrm";

/** Regular syncs re-read this many days so status changes on recent leads are picked up. */
const REFRESH_DAYS = Number(process.env.TELECRM_REFRESH_DAYS) || 30;
const UPSERT_CHUNK_SIZE = 200;

export interface TeleCrmSyncOptions {
  /** Only sync TeleCRM accounts linked to these clients. */
  clientIds?: string[];
  /** Read every lead in the account instead of the last REFRESH_DAYS days. */
  full?: boolean;
  onProgress?: (message: string) => void;
}

export interface TeleCrmAccountResult {
  enterpriseId: string;
  clients: string[];
  fetched: number;
  inserted: number;
  updated: number;
  error?: string;
}

interface GroupClient {
  id: string;
  name: string;
  telecrmEnterpriseId: string | null;
  telecrmToken: string | null;
}

export async function syncTeleCrmLeads(options: TeleCrmSyncOptions = {}): Promise<TeleCrmAccountResult[]> {
  const clients = await prisma.client.findMany({
    where: { isActive: true, telecrmEnterpriseId: { not: null } },
    select: { id: true, name: true, telecrmEnterpriseId: true, telecrmToken: true },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, GroupClient[]>();
  for (const c of clients) {
    const key = c.telecrmEnterpriseId!.trim();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  const results: TeleCrmAccountResult[] = [];
  for (const [enterpriseId, group] of groups) {
    if (options.clientIds && !group.some((c) => options.clientIds!.includes(c.id))) continue;
    results.push(await syncAccount(enterpriseId, group, options));
  }
  return results;
}

async function syncAccount(
  enterpriseId: string,
  group: GroupClient[],
  { full, onProgress }: TeleCrmSyncOptions
): Promise<TeleCrmAccountResult> {
  const result: TeleCrmAccountResult = {
    enterpriseId,
    clients: group.map((c) => c.name),
    fetched: 0,
    inserted: 0,
    updated: 0,
  };

  const token = group.find((c) => c.telecrmToken?.trim())?.telecrmToken?.trim();
  if (!token) {
    result.error = "No TeleCRM token set on any client using this enterprise ID";
    return result;
  }

  try {
    const fallbackClientId = group[0].id;
    const campaignOwner = await buildCampaignOwnerMap(group.map((c) => c.id));
    const branchOwner = buildBranchMatcher(group);
    const createdAfter = full ? undefined : Date.now() - REFRESH_DAYS * 24 * 60 * 60 * 1000;

    for await (const page of iterateTeleCrmLeads(enterpriseId, token, createdAfter)) {
      const leads = await normalizePage(page, enterpriseId, token);
      const rows = leads.map((lead) => ({
        clientId:
          (lead.campaign && campaignOwner.get(lead.campaign.trim().toLowerCase())) ||
          (lead.branch && branchOwner(lead.branch)) ||
          fallbackClientId,
        lead,
      }));

      const { inserted, updated } = await upsertLeads(rows);
      result.fetched += page.length;
      result.inserted += inserted;
      result.updated += updated;
      onProgress?.(`${enterpriseId}: ${result.fetched} fetched, ${result.inserted} new, ${result.updated} updated`);
    }

    await prisma.client.updateMany({
      where: { id: { in: group.map((c) => c.id) } },
      data: { telecrmSyncedAt: new Date() },
    });
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`[TeleCRM] ${enterpriseId}:`, result.error);
  }

  return result;
}

/** Campaign name → client, for names that belong to exactly one client in the group. */
async function buildCampaignOwnerMap(clientIds: string[]) {
  const campaigns = await prisma.campaign.findMany({
    where: { clientId: { in: clientIds } },
    select: { name: true, clientId: true },
  });

  const owners = new Map<string, Set<string>>();
  for (const c of campaigns) {
    const key = c.name.trim().toLowerCase();
    owners.set(key, (owners.get(key) ?? new Set()).add(c.clientId));
  }

  return new Map(
    [...owners].filter(([, ids]) => ids.size === 1).map(([name, ids]) => [name, [...ids][0]])
  );
}

/**
 * Match a "Branch: T. Nagar" note to a client in the group by name — e.g.
 * "T. Nagar" → "Ayush Ortho T.Nagar", "Pondicherry" → "Ayush Ortho Pondi Branch".
 * Words shared by every client name (the brand) are ignored.
 */
function buildBranchMatcher(group: GroupClient[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const shared = new Set(
    wordsOf(group[0]?.name ?? "").filter((w) => group.every((c) => wordsOf(c.name).includes(w)))
  );

  return (branch: string): string | null => {
    const b = norm(branch);
    if (b.length < 3) return null;
    const hits = group.filter(
      (c) =>
        norm(c.name).includes(b) ||
        wordsOf(c.name).some((w) => !shared.has(w) && (b.startsWith(w) || w.startsWith(b)))
    );
    return hits.length === 1 ? hits[0].id : null;
  };
}

/**
 * Classify a page of leads. Most are decided from their fields; system-created
 * leads without a Facebook ID (website forms, WhatsApp, call tracking) need one
 * extra request for their history, which is skipped when the lead is already stored.
 */
async function normalizePage(page: TeleCrmLead[], enterpriseId: string, token: string) {
  const unresolved = page.filter((l) => quickTeleCrmSource(l) === null);

  const known = new Map<string, LeadSource>();
  if (unresolved.length > 0) {
    const stored = await prisma.lead.findMany({
      where: { crmId: { in: unresolved.map((l) => l.id) } },
      select: { crmId: true, source: true },
    });
    for (const s of stored) known.set(s.crmId!, s.source);
  }

  const out: NormalizedTeleCrmLead[] = [];
  for (const lead of page) {
    const quick = quickTeleCrmSource(lead);
    if (quick) {
      out.push(normalizeTeleCrmLead(lead, quick));
      continue;
    }
    const storedSource = known.get(lead.id);
    if (storedSource) {
      out.push(normalizeTeleCrmLead(lead, storedSource));
      continue;
    }
    let origin: TeleCrmOrigin | null = null;
    try {
      origin = await fetchTeleCrmOrigin(enterpriseId, token, lead.id);
    } catch (error) {
      console.warn(`[TeleCRM] history for ${lead.id}:`, error instanceof Error ? error.message : error);
    }
    out.push(normalizeTeleCrmLead(lead, sourceFromOrigin(origin), origin));
  }
  return out;
}

/**
 * INSERT … ON CONFLICT on (source, externalId). Existing leads keep their client
 * and any values they already have; TeleCRM status/ID and metadata are refreshed.
 * Rows whose status hasn't changed are skipped entirely.
 */
async function upsertLeads(allRows: { clientId: string; lead: NormalizedTeleCrmLead }[]) {
  // One statement can't touch the same row twice — keep the first (newest) per key
  const seen = new Set<string>();
  const rows = allRows.filter(({ lead }) => {
    const key = `${lead.source}:${lead.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let inserted = 0;
  let updated = 0;
  const now = new Date();

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const values = rows.slice(i, i + UPSERT_CHUNK_SIZE).map(({ clientId, lead }) => Prisma.sql`(
      ${randomUUID()}, ${clientId}, ${lead.source}::"LeadSource",
      ${lead.name}, ${lead.phone}, ${lead.email}, ${lead.message}, ${lead.campaign},
      ${lead.externalId}, ${lead.crmId}, ${lead.crmStatus},
      ${JSON.stringify(lead.metadata)}::jsonb, ${lead.createdAt}, ${now}
    )`);

    const changed = await prisma.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO "leads" (
        "id", "clientId", "source", "name", "phone", "email", "message", "campaign",
        "externalId", "crmId", "crmStatus", "metadata", "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("source", "externalId") DO UPDATE SET
        "crmId"     = EXCLUDED."crmId",
        "crmStatus" = EXCLUDED."crmStatus",
        "name"      = COALESCE("leads"."name", EXCLUDED."name"),
        "phone"     = COALESCE("leads"."phone", EXCLUDED."phone"),
        "email"     = COALESCE("leads"."email", EXCLUDED."email"),
        "campaign"  = COALESCE("leads"."campaign", EXCLUDED."campaign"),
        "message"   = COALESCE("leads"."message", EXCLUDED."message"),
        "metadata"  = COALESCE("leads"."metadata", '{}'::jsonb)
                      || jsonb_build_object('telecrm', EXCLUDED."metadata"->'telecrm'),
        "updatedAt" = EXCLUDED."updatedAt"
      WHERE "leads"."crmId" IS DISTINCT FROM EXCLUDED."crmId"
         OR "leads"."crmStatus" IS DISTINCT FROM EXCLUDED."crmStatus"
      RETURNING (xmax = 0) AS "inserted"
    `;

    for (const r of changed) r.inserted ? inserted++ : updated++;
  }

  return { inserted, updated };
}

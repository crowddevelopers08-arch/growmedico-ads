/**
 * AdPulse — TeleCRM API client
 *
 * Reads leads with TeleCRM's "Sync" token (Integrations → Website/API Integration →
 * Create new token → Sync). The public docs only cover the push-only "Async" API;
 * the read endpoints below were verified against a live account:
 *
 *   POST /enterprise/{enterpriseId}/lead/search?skip=&limit=   body {"fields":{}}
 *        → { data: TeleCrmLead[], total_count, skip, limit } — newest created_on first, limit ≤ 100
 *   GET  /enterprise/{enterpriseId}/lead/{leadId}?includeActions=true&limit=
 *        → { id, fields, actions[] }
 *
 * Lead history (actions) can contain third-party secrets (e.g. Facebook access
 * tokens in CUSTOM_API calls), so actions are only inspected, never stored.
 */

import type { LeadSource } from "@prisma/client";

const TELECRM_BASE = process.env.TELECRM_API_BASE || "https://next.telecrm.in/autoupdate/v2";
export const TELECRM_PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 4;

export interface TeleCrmLead {
  id: string;
  employeeid?: string;
  createdBy?: string;
  status?: string;
  fields: Record<string, unknown>;
}

interface TeleCrmSearchResponse {
  data: TeleCrmLead[];
  total_count: number;
  skip: number;
  limit: number;
}

interface TeleCrmAction {
  type: string;
  creationTimestamp?: number;
  isLeadCaptureAction?: boolean;
  text?: string;
}

/** What a lead's history says about where it came from. */
export interface TeleCrmOrigin {
  /** Type of the action flagged as the lead capture, e.g. "FACEBOOK", "CALLER_DESK_INCOMING_CALL". */
  captureType: string | null;
  /** Pushed in through TeleCRM's API (website forms, chatbots, Zapier…). */
  apiPushed: boolean;
  /** "Lead Source: Whatsapp Number …" note, or an incoming WhatsApp message. */
  whatsapp: boolean;
  /** "Key: value" system notes written at capture time (form name, answers, page URL…). */
  notes: Record<string, string>;
}

export class TeleCrmError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "TeleCrmError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch with retries on 429 / 5xx / network errors (TeleCRM returns sporadic 500s on deep pages). */
async function telecrmFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));

    try {
      const res = await fetch(`${TELECRM_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });

      if (res.ok) return (await res.json()) as T;

      const text = await res.text();
      let message = text.slice(0, 200);
      try {
        const json = JSON.parse(text);
        message = json?.error?.message ?? json?.message ?? message;
      } catch {
        // not JSON (e.g. an HTML 404 page)
      }

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (retryAfter > 0) await sleep(Math.min(retryAfter, 60) * 1000);
        lastError = new TeleCrmError(`TeleCRM ${res.status}: ${message}`, res.status);
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        throw new TeleCrmError("TeleCRM rejected the token — check the enterprise ID and Sync token", res.status);
      }
      if (res.status === 404) {
        throw new TeleCrmError("TeleCRM enterprise not found — check the enterprise ID", res.status);
      }
      throw new TeleCrmError(`TeleCRM ${res.status}: ${message}`, res.status);
    } catch (error) {
      if (error instanceof TeleCrmError && error.statusCode < 500 && error.statusCode !== 429) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function searchTeleCrmLeads(enterpriseId: string, token: string, skip: number, limit = TELECRM_PAGE_SIZE) {
  return telecrmFetch<TeleCrmSearchResponse>(
    `/enterprise/${encodeURIComponent(enterpriseId)}/lead/search?skip=${skip}&limit=${limit}`,
    token,
    { method: "POST", body: JSON.stringify({ fields: {} }) }
  );
}

/**
 * Pages through leads newest-first, stopping once a page reaches leads created
 * before `createdAfter` (ms). Omit it to read the whole account.
 */
export async function* iterateTeleCrmLeads(
  enterpriseId: string,
  token: string,
  createdAfter?: number
): AsyncGenerator<TeleCrmLead[]> {
  for (let skip = 0; ; skip += TELECRM_PAGE_SIZE) {
    const page = await searchTeleCrmLeads(enterpriseId, token, skip);
    const rows = page.data ?? [];
    if (rows.length === 0) return;

    const inWindow = createdAfter ? rows.filter((l) => toMillis(l.fields.created_on) >= createdAfter) : rows;
    if (inWindow.length > 0) yield inWindow;

    if (inWindow.length < rows.length || rows.length < TELECRM_PAGE_SIZE) return;
  }
}

/**
 * Read a lead's history to find its channel. Only capture-time system notes are
 * kept — other actions (e.g. CUSTOM_API calls) can contain third-party secrets.
 */
export async function fetchTeleCrmOrigin(enterpriseId: string, token: string, leadId: string): Promise<TeleCrmOrigin> {
  const lead = await telecrmFetch<{ actions?: TeleCrmAction[] } | { data: { actions?: TeleCrmAction[] } }>(
    `/enterprise/${encodeURIComponent(enterpriseId)}/lead/${encodeURIComponent(leadId)}?includeActions=true&limit=100`,
    token
  );
  const actions = [...(("data" in lead ? lead.data.actions : lead.actions) ?? [])].sort(
    (a, b) => (a.creationTimestamp ?? 0) - (b.creationTimestamp ?? 0)
  );

  const notes: Record<string, string> = {};
  let whatsapp = actions.some((a) => /INCOMING_WHATSAPP/i.test(a.type));
  for (const a of actions) {
    if (a.type !== "SYSTEM_NOTE" || !a.text) continue;
    const m = a.text.trim().match(/^([^:\n]{1,60}):\s*([\s\S]*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (/^lead source$/i.test(key.trim()) && /whatsapp/i.test(value)) whatsapp = true;
    if (!(key.trim() in notes)) notes[key.trim()] = value.trim().slice(0, 1000);
  }

  return {
    captureType: actions.find((a) => a.isLeadCaptureAction)?.type ?? null,
    apiPushed: actions.some((a) => a.type === "AUTO_UPDATE_LEAD_ACTION"),
    whatsapp,
    notes,
  };
}

// ── Normalization ───────────────────────────────────────────

/** Fields stored in dedicated columns / metadata rather than shown as form answers. */
const NON_ANSWER_FIELDS = new Set([
  "phone", "name", "email", "alternate_phone",
  "captured_on", "capture_frequency", "created_on", "modified_on",
]);

function toMillis(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/** TeleCRM stores phones as bare digits with country code (e.g. 919876543210). */
function formatPhone(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return digits.length > 10 && !s.startsWith("+") ? `+${digits}` : s;
}

function safeParam(url: string, name: string): string | null {
  try {
    return new URL(url).searchParams.get(name);
  } catch {
    return null;
  }
}

function humanize(key: string) {
  const text = key.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Decide which AdPulse source a TeleCRM lead belongs to. Returns null when it
 * can only be told from the lead's capture action (system-created, no Facebook ID).
 */
export function quickTeleCrmSource(lead: TeleCrmLead): LeadSource | null {
  if (str(lead.fields.facebook_lead_id)) return "META_FORM";
  // Created by a staff member's login (not a "__system" user) → entered by hand
  if (lead.createdBy && !lead.createdBy.startsWith("__")) return "MANUAL";
  return null;
}

export function sourceFromOrigin(origin: TeleCrmOrigin | null): LeadSource {
  if (!origin) return "MANUAL";
  const t = (origin.captureType ?? "").toUpperCase();
  if (t.includes("FACEBOOK")) return "META_FORM";
  if (origin.whatsapp || t.includes("WHATSAPP")) return "WHATSAPP";
  if (origin.apiPushed || /WEB|FORM|API|LANDING|GOOGLE|INDIAMART|JUSTDIAL/.test(t)) return "WEBSITE";
  return "MANUAL";
}

/** Notes that are links or repeat other notes — kept in metadata, not in the message. */
const URL_NOTE = /url$/i;
const REDUNDANT_NOTES = /^(complete form data|lead source)$/i;

export function normalizeTeleCrmLead(lead: TeleCrmLead, source: LeadSource, origin?: TeleCrmOrigin | null) {
  const f = lead.fields;
  const facebookLeadId = str(f.facebook_lead_id);

  const answers = Object.fromEntries(
    Object.entries(f)
      .filter(([k, v]) => !NON_ANSWER_FIELDS.has(k) && !k.startsWith("facebook_") && str(v) !== null && typeof v !== "object")
      .map(([k, v]) => [k, String(v)])
  );

  const notes = origin?.notes ?? {};
  const pageUrl = Object.entries(notes).find(([k]) => URL_NOTE.test(k))?.[1] ?? null;
  const utmCampaign = pageUrl ? safeParam(pageUrl, "utm_campaign") : null;
  const formName = notes["Form Name"] ?? null;

  const message = [
    ...Object.entries(answers)
      .filter(([k]) => k !== "city")
      .map(([k, v]) => `${humanize(k)}: ${v.replace(/_/g, " ")}`),
    ...Object.entries(notes)
      .filter(([k]) => !URL_NOTE.test(k) && !REDUNDANT_NOTES.test(k))
      .map(([k, v]) => `${k}: ${v}`),
  ].join(" · ");

  const name = str(f.name);
  const createdOn = toMillis(f.created_on) || toMillis(f.captured_on);

  return {
    source,
    // Facebook leads keep Meta's lead ID so they merge with leads from the Meta sync/webhook
    externalId: source === "META_FORM" && facebookLeadId ? facebookLeadId : lead.id,
    crmId: lead.id,
    crmStatus: str(lead.status),
    name: name && name.toLowerCase() !== "unknown" ? name : null,
    phone: formatPhone(f.phone),
    email: str(f.email),
    campaign: str(f.facebook_campaign) ?? (formName ? `Form: ${formName}` : null) ?? utmCampaign,
    message: message ? message.slice(0, 5000) : null,
    /** "Branch: T. Nagar" style note, used to route the lead to a branch client. */
    branch: notes["Branch"] ?? null,
    metadata: {
      telecrm: {
        id: lead.id,
        status: str(lead.status),
        owner: str(lead.employeeid),
        createdBy: str(lead.createdBy),
        captureType: origin?.captureType ?? null,
        apiPushed: origin?.apiPushed ?? false,
        pageUrl,
        utmCampaign,
        notes: Object.keys(notes).length > 0 ? notes : undefined,
        capturedOn: toMillis(f.captured_on) || null,
        captureCount: toMillis(f.capture_frequency) || null,
        alternatePhone: formatPhone(f.alternate_phone),
        facebook: facebookLeadId
          ? {
              leadId: facebookLeadId,
              adName: str(f.facebook_ad),
              adSetId: str(f.facebook_ad_set_id),
              adSetName: str(f.facebook_ad_set_name),
              platform: str(f.facebook_platform),
              isOrganic: str(f.facebook_is_organic) === "true",
            }
          : null,
        fields: answers,
      },
    },
    createdAt: createdOn ? new Date(createdOn) : new Date(),
  };
}

export type NormalizedTeleCrmLead = ReturnType<typeof normalizeTeleCrmLead>;

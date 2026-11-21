/**
 * Minimal Google Sheets REST client authenticated as a service account.
 *
 * Setup: create a service account in Google Cloud (Sheets API enabled), add a
 * JSON key, then set GOOGLE_SERVICE_ACCOUNT_EMAIL and
 * GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY. Share the target spreadsheet with the
 * service account email as an Editor.
 */

import { createSign } from "crypto";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

let cached: { token: string; expires: number } | null = null;

export function sheetsConfig() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return { email, key, configured: Boolean(email && key) };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const { email, key, configured } = sheetsConfig();
  if (!configured) throw new Error("Google Sheets is not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(key!))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${json.error_description ?? json.error ?? res.statusText}`);
  cached = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? res.statusText;
    if (res.status === 403 || res.status === 404) {
      throw new Error(`${msg} — share the spreadsheet with ${sheetsConfig().email} as an Editor`);
    }
    throw new Error(`Google Sheets: ${msg}`);
  }
  return json as T;
}

export interface SheetProps {
  sheetId: number;
  title: string;
  index: number;
  gridProperties?: { rowCount?: number; columnCount?: number };
  /** Number of conditional-format rules on the tab (only when requested). */
  conditionalRules?: number;
}

export async function getSheets(spreadsheetId: string, withRules = false) {
  const fields = `properties.title,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount))${withRules ? ",conditionalFormats(ranges(sheetId))" : ""})`;
  const json = await call<{
    properties: { title: string };
    sheets: { properties: SheetProps; conditionalFormats?: unknown[] }[];
  }>(`${API}/${spreadsheetId}?fields=${encodeURIComponent(fields)}`);
  return {
    title: json.properties.title,
    sheets: json.sheets.map((s) => ({ ...s.properties, conditionalRules: s.conditionalFormats?.length ?? 0 })),
  };
}

export async function batchGetValues(spreadsheetId: string, ranges: string[]) {
  if (ranges.length === 0) return [];
  const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", majorDimension: "ROWS" });
  for (const r of ranges) params.append("ranges", r);
  const json = await call<{ valueRanges?: { values?: unknown[][] }[] }>(`${API}/${spreadsheetId}/values:batchGet?${params}`);
  return (json.valueRanges ?? []).map((v) => v.values ?? []);
}

export async function batchClearValues(spreadsheetId: string, ranges: string[]) {
  if (ranges.length === 0) return;
  await call(`${API}/${spreadsheetId}/values:batchClear`, { method: "POST", body: JSON.stringify({ ranges }) });
}

export async function batchUpdateValues(
  spreadsheetId: string,
  data: { range: string; values: unknown[][] }[],
  valueInputOption: "RAW" | "USER_ENTERED" = "RAW"
) {
  if (data.length === 0) return;
  await call(`${API}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption, data }),
  });
}

export async function batchUpdate(spreadsheetId: string, requests: object[]) {
  if (requests.length === 0) return { replies: [] as { addSheet?: { properties: SheetProps } }[] };
  return call<{ replies: { addSheet?: { properties: SheetProps } }[] }>(`${API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function parseSpreadsheetId(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(input.trim()) ? input.trim() : null;
}

/** 'Tab name'!A1 style reference */
export const a1 = (tab: string, range = "") => `'${tab.replace(/'/g, "''")}'${range ? `!${range}` : ""}`;

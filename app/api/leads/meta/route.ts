/**
 * AdPulse — Meta Lead Ads Webhook
 *
 * GET  /api/leads/meta — Webhook verification handshake
 * POST /api/leads/meta — `leadgen` events from subscribed Facebook Pages
 *
 * Each event's page_id is matched to a client via Client.metaPageId, then the
 * full lead is fetched from the Graph API and stored with source META_FORM.
 *
 * Required env vars:
 *   META_WEBHOOK_VERIFY_TOKEN — any string; must match the one set in the Meta app
 *   META_APP_SECRET           — verifies the x-hub-signature-256 header
 *   META_PAGE_ACCESS_TOKEN    — token with leads_retrieval (falls back to the client's accessToken)
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchMetaLead, normalizeMetaLead } from "@/lib/metaAds";

interface LeadgenChange {
  field: string;
  value: { leadgen_id: string; page_id: string; form_id?: string; created_time?: number };
}

interface WebhookPayload {
  object: string;
  entry?: { id: string; changes?: LeadgenChange[] }[];
}

// ── GET — verification ──────────────────────────────────────
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ── POST — leadgen events ───────────────────────────────────
export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const changes = (payload.entry ?? [])
    .flatMap((e) => e.changes ?? [])
    .filter((c) => c.field === "leadgen");

  const results = await Promise.allSettled(changes.map((c) => saveLead(c.value)));
  for (const r of results) {
    if (r.status === "rejected") console.error("[Meta leadgen]", r.reason);
  }

  // Always 200 so Meta doesn't retry-storm; failures are logged above
  return NextResponse.json({ received: changes.length });
}

async function saveLead(value: LeadgenChange["value"]) {
  const client = await prisma.client.findUnique({ where: { metaPageId: value.page_id } });
  if (!client) {
    throw new Error(`No client mapped to Meta page ${value.page_id}`);
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN || client.accessToken || process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error(`No access token available for client ${client.id}`);

  const lead = await fetchMetaLead(value.leadgen_id, token);
  const data = { clientId: client.id, ...normalizeMetaLead(lead, value.form_id) };

  await prisma.lead.upsert({
    where: { source_externalId: { source: "META_FORM", externalId: lead.id } },
    create: data,
    update: {},
  });
}

function isValidSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);

  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  );
}

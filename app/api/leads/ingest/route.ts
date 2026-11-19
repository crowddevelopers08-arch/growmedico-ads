/**
 * AdPulse — Generic Lead Ingest
 *
 * POST /api/leads/ingest
 *
 * Used by website forms and WhatsApp tools (WATI, Interakt, AiSensy, Zapier, Make…)
 * to push leads in. Accepts JSON or form-urlencoded bodies.
 *
 * Auth: LEADS_INGEST_SECRET via `x-lead-secret` header or `?key=` query param.
 *
 * Body:
 *   clientId  (required) — AdPulse client ID
 *   source    (required) — WHATSAPP | WEBSITE | META_FORM
 *   name, phone, email, message, campaign — optional
 *   externalId — optional; leads with the same source + externalId are deduped
 *   createdAt  — optional ISO timestamp (defaults to now)
 *   Any other fields are stored in `metadata`.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-lead-secret",
};

const ingestSchema = z.object({
  clientId: z.string().min(1),
  source: z.enum(["WHATSAPP", "WEBSITE", "META_FORM", "MANUAL"]),
  name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
  campaign: z.string().max(200).optional(),
  externalId: z.string().max(200).optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: CORS_HEADERS });

  const secret = process.env.LEADS_INGEST_SECRET;
  const { searchParams } = new URL(request.url);
  const provided = request.headers.get("x-lead-secret") ?? searchParams.get("key");

  if (!secret || provided !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    body = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const validated = ingestSchema.safeParse(body);
  if (!validated.success) {
    return json({ error: "Validation failed", details: validated.error.flatten() }, 400);
  }

  const { clientId, source, externalId, createdAt, ...fields } = validated.data;

  try {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return json({ error: "Client not found" }, 404);

    // Keep any extra fields the sender included
    const known = new Set(Object.keys(ingestSchema.shape));
    const extra = Object.fromEntries(Object.entries(body).filter(([k]) => !known.has(k)));

    const data = {
      clientId,
      source,
      ...fields,
      externalId,
      metadata: Object.keys(extra).length > 0 ? (extra as object) : undefined,
      ...(createdAt && { createdAt: new Date(createdAt) }),
    };

    const lead = externalId
      ? await prisma.lead.upsert({
          where: { source_externalId: { source, externalId } },
          create: data,
          update: {},
        })
      : await prisma.lead.create({ data });

    return json({ data: { id: lead.id } }, 201);
  } catch (error) {
    console.error("[POST /api/leads/ingest]", error);
    return json({ error: "Failed to save lead" }, 500);
  }
}

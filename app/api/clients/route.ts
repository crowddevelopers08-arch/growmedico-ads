import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withoutSecrets } from "@/lib/utils";
import type { CreateClientInput } from "@/types";

// ── Validation schema ───────────────────────────────────────
const createClientSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  company: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  whatsappPhone: z.string().max(20).optional(),
  metaPageId: z.string().max(50).optional(),
  platform: z.enum(["GOOGLE", "META"]),
  accountId: z.string().min(1, "Account ID is required").max(50),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  notes: z.string().max(500).optional(),
  telecrmEnterpriseId: z.string().max(64).optional(),
  telecrmToken: z.string().max(500).optional(),
});

// ── GET /api/clients ────────────────────────────────────────
export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const isActive = searchParams.get("isActive");
    const search = searchParams.get("search");

    const clients = await prisma.client.findMany({
      where: {
        ...(platform && { platform: platform as "GOOGLE" | "META" }),
        ...(isActive !== null && { isActive: isActive === "true" }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { company: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      include: {
        campaigns: {
          select: { spend: true, status: true },
        },
        alerts: {
          where: { isRead: false },
          select: { id: true, isRead: true },
        },
        _count: {
          select: {
            campaigns: true,
            alerts: { where: { isRead: false } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: clients.map(withoutSecrets) });
  } catch (error) {
    console.error("[GET /api/clients]", error);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

// ── POST /api/clients ───────────────────────────────────────
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: CreateClientInput = await request.json();
    const validated = createClientSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // Check for duplicate account
    const existing = await prisma.client.findUnique({
      where: {
        platform_accountId: {
          platform: validated.data.platform,
          accountId: validated.data.accountId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `A client with this ${validated.data.platform} account ID already exists.` },
        { status: 409 }
      );
    }

    const client = await prisma.client.create({
      data: {
        name: validated.data.name,
        company: validated.data.company,
        email: validated.data.email || null,
        phone: validated.data.phone,
        whatsappPhone: validated.data.whatsappPhone,
        metaPageId: validated.data.metaPageId || null,
        platform: validated.data.platform,
        accountId: validated.data.accountId,
        accessToken: validated.data.accessToken,
        refreshToken: validated.data.refreshToken,
        notes: validated.data.notes,
        telecrmEnterpriseId: validated.data.telecrmEnterpriseId?.trim() || null,
        telecrmToken: validated.data.telecrmToken?.trim() || null,
      },
    });

    return NextResponse.json({ data: withoutSecrets(client) }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "This Meta Page ID is already linked to another client." },
        { status: 409 }
      );
    }
    console.error("[POST /api/clients]", error);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}

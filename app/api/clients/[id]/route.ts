import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateClientSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  company: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  whatsappPhone: z.string().max(20).optional(),
  accountId: z.string().min(1).max(50).optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

// ── GET /api/clients/[id] ───────────────────────────────────
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        campaigns: {
          orderBy: { spend: "desc" },
        },
        alerts: {
          where: { isRead: false },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: {
            campaigns: true,
            alerts: { where: { isRead: false } },
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({ data: client });
  } catch (error) {
    console.error(`[GET /api/clients/${id}]`, error);
    return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 });
  }
}

// ── PATCH /api/clients/[id] ─────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const validated = updateClientSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const client = await prisma.client.update({
      where: { id },
      data: {
        ...validated.data,
        email: validated.data.email || null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ data: client });
  } catch (error: unknown) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error(`[PATCH /api/clients/${id}]`, error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

// ── DELETE /api/clients/[id] ────────────────────────────────
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ message: "Client deleted successfully" });
  } catch (error: unknown) {
    const e = error as { code?: string };
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error(`[DELETE /api/clients/${id}]`, error);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}

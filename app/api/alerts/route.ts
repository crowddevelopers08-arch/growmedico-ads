import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markAllAlertsAsRead } from "@/lib/alertEngine";

// ── GET /api/alerts ─────────────────────────────────────────
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId") ?? undefined;
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const severity = searchParams.get("severity") as "INFO" | "WARNING" | "CRITICAL" | null;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Number(searchParams.get("pageSize") ?? 20));

    const where = {
      ...(clientId && { clientId }),
      ...(unreadOnly && { isRead: false }),
      ...(severity && { severity }),
    };

    const [alerts, total, unreadCount] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, platform: true } },
        },
        orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.alert.count({ where }),
      prisma.alert.count({ where: { isRead: false } }),
    ]);

    return NextResponse.json({
      data: alerts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      unreadCount,
    });
  } catch (error) {
    console.error("[GET /api/alerts]", error);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}

// ── PATCH /api/alerts — mark alerts as read ─────────────────
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    if (body.markAllRead) {
      await markAllAlertsAsRead(body.clientId);
      return NextResponse.json({ message: "All alerts marked as read" });
    }

    if (Array.isArray(body.alertIds) && body.alertIds.length > 0) {
      await prisma.alert.updateMany({
        where: { id: { in: body.alertIds } },
        data: { isRead: true },
      });
      return NextResponse.json({ message: "Alerts marked as read" });
    }

    return NextResponse.json({ error: "No action specified" }, { status: 400 });
  } catch (error) {
    console.error("[PATCH /api/alerts]", error);
    return NextResponse.json({ error: "Failed to update alerts" }, { status: 500 });
  }
}

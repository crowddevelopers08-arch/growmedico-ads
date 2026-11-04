import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchMetaAccountBalance, resolveMetaAccessToken } from "@/lib/metaAds";

export const dynamic = "force-dynamic";

// GET /api/balance — fetch live account balances from Meta API
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const metaClients = await prisma.client.findMany({
      where: { isActive: true, platform: "META" },
      select: { id: true, name: true, accountId: true, accessToken: true },
    });

    if (metaClients.length === 0) {
      return NextResponse.json({ total: 0, clients: [], fetchedAt: new Date().toISOString() });
    }

    const results = await Promise.allSettled(
      metaClients.map(async (client) => {
        const token = resolveMetaAccessToken(client.accessToken);
        if (!token) {
          return { id: client.id, name: client.name, balance: 0, isPrepaid: null, amountDue: 0, error: "No access token" };
        }
        const funding = await fetchMetaAccountBalance(client.accountId, token);
        await prisma.client.update({
          where: { id: client.id },
          data: { ...funding, balanceUpdatedAt: new Date() },
        });
        return { id: client.id, name: client.name, ...funding };
      })
    );

    const clients = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { id: metaClients[i].id, name: metaClients[i].name, balance: 0, isPrepaid: null, amountDue: 0, error: String((r as PromiseRejectedResult).reason) }
    );

    // Only prepaid accounts hold funds; postpaid amounts due are reported separately
    const total = clients.reduce((sum, c) => sum + c.balance, 0);
    const totalDue = clients.reduce((sum, c) => sum + c.amountDue, 0);
    const failed = clients.filter((c) => "error" in c).length;
    const fetchedAt = new Date().toISOString();

    const response = NextResponse.json({ total, totalDue, clients, failed, fetchedAt });
    // Prevent browser/CDN from caching the balance response
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error) {
    console.error("[GET /api/balance]", error);
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}

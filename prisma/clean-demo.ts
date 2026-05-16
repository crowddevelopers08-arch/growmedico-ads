/**
 * Removes all demo/seed data (clients, campaigns, alerts, sync logs)
 * while preserving the admin user and any real clients you have added.
 *
 * Demo clients are identified by their fake account IDs seeded in seed.ts.
 * Run: npm run db:clean-demo
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_ACCOUNT_IDS = ["123-456-7890", "act_987654321"];

async function main() {
  console.log("🧹 Cleaning demo data...");

  const demoClients = await prisma.client.findMany({
    where: { accountId: { in: DEMO_ACCOUNT_IDS } },
    select: { id: true, name: true },
  });

  if (demoClients.length === 0) {
    console.log("✅ No demo clients found — nothing to clean.");
    return;
  }

  const clientIds = demoClients.map((c) => c.id);

  // Delete in dependency order
  const alerts = await prisma.alert.deleteMany({ where: { clientId: { in: clientIds } } });
  const syncLogs = await prisma.syncLog.deleteMany({ where: { clientId: { in: clientIds } } });
  const campaigns = await prisma.campaign.deleteMany({ where: { clientId: { in: clientIds } } });
  const clients = await prisma.client.deleteMany({ where: { id: { in: clientIds } } });

  console.log(`✅ Removed ${clients.count} demo client(s)`);
  console.log(`   ${campaigns.count} campaigns`);
  console.log(`   ${alerts.count} alerts`);
  console.log(`   ${syncLogs.count} sync logs`);
  console.log("\nYour database is now clean. Add real clients via the dashboard UI.");
}

main()
  .catch((e) => {
    console.error("❌ Clean failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

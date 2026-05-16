import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting AdPulse seed...");

  // ── Admin User ──────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@adpulse.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "AdPulse123!";

  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashedPassword,
      name: "AdPulse Admin",
      role: "ADMIN",
    },
  });

  console.log(`✅ Admin user: ${admin.email}`);
  console.log("🎉 Seed complete!");
  console.log(`\n📧 Login: ${adminEmail}`);
  console.log(`🔑 Password: ${adminPassword}`);
  console.log("\nNext steps:");
  console.log("  1. Add real clients via the dashboard UI");
  console.log("  2. Run a sync: POST /api/sync");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

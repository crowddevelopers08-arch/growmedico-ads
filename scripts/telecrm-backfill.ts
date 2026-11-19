/**
 * Import every lead from each linked TeleCRM account (the scheduled sync only
 * re-reads the last TELECRM_REFRESH_DAYS days). Safe to re-run — leads are upserted.
 *
 *   npm run telecrm:backfill                  # all TeleCRM accounts
 *   npm run telecrm:backfill -- <clientId>    # only the account linked to this client
 */

import { prisma } from "@/lib/prisma";
import { syncTeleCrmLeads } from "@/lib/telecrmSync";

async function main() {
  const clientId = process.argv[2];
  const started = Date.now();

  const results = await syncTeleCrmLeads({
    full: true,
    clientIds: clientId ? [clientId] : undefined,
    onProgress: (msg) => process.stdout.write(`\r${msg}   `),
  });
  process.stdout.write("\n");

  if (results.length === 0) {
    console.log("No active clients with a TeleCRM enterprise ID found.");
  }
  for (const r of results) {
    console.log(
      `${r.error ? "✗" : "✓"} ${r.clients.join(", ")} — ${r.fetched} fetched, ${r.inserted} new, ${r.updated} updated` +
        (r.error ? `\n  Error: ${r.error}` : "")
    );
  }
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s`);
  if (results.some((r) => r.error)) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());

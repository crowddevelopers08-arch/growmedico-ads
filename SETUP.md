# AdPulse — Setup Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- `pnpm` or `npm`

---

## 1. Install dependencies

```bash
npm install
```

---

## 2. Configure environment variables

All settings live in a single `.env` file in the project root (never committed to git).
Copy the same variables into your hosting provider's environment settings.

| Variable | Description |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | PostgreSQL connection strings (pooled for the app, unpooled for migrations) |
| `NEXTAUTH_SECRET` | Random 32+ char secret (use `openssl rand -base64 32`) |
| `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` | Your app URL |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin login created by `npm run db:seed` |
| `CRON_SECRET` | Random secret for sync / audit cron jobs |
| `BUDGET_ALERT_THRESHOLD` | Budget-used % that triggers an alert |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `GOOGLE_ADS_REFRESH_TOKEN` | Google Ads API (manager account) |
| `META_APP_ID`, `META_APP_SECRET`, `META_API_VERSION`, `META_ACCESS_TOKEN` | Meta Ads API |
| `META_WEBHOOK_VERIFY_TOKEN`, `META_PAGE_ACCESS_TOKEN`, `LEADS_INGEST_SECRET` | Lead webhooks / ingest |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `WHATSAPP_ADMIN_PHONE` | WhatsApp alerts |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `AUDIT_SPREADSHEET_ID` | Audit Sheets → Google Sheets |
| `TELECRM_REFRESH_DAYS` | Optional — days of TeleCRM leads re-read on each sync (default 30) |

---

## 3. Set up the database

```bash
# Create and migrate schema
npm run db:push

# Generate Prisma client
npm run db:generate

# Seed demo data (creates admin user + sample clients)
npm run db:seed
```

Default admin credentials (change these!):
- Email: `admin@adpulse.com`
- Password: `AdPulse123!`

---

## 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 5. Production build

```bash
npm run build
npm run start
```

---

## Project Structure

```
adpulse/
├── app/
│   ├── (auth)/login/           # Login page
│   ├── (dashboard)/            # Protected dashboard layout
│   │   ├── dashboard/          # Main dashboard (/dashboard)
│   │   ├── clients/            # Client management
│   │   │   ├── new/            # Add client
│   │   │   └── [id]/           # Client detail + edit
│   │   ├── campaigns/          # Campaign browser
│   │   └── alerts/             # Alert center
│   └── api/                    # API routes
│       ├── auth/[...nextauth]/ # NextAuth handler
│       ├── clients/            # CRUD
│       ├── campaigns/          # Read campaigns
│       ├── alerts/             # Read + mark read
│       ├── sync/               # Trigger data sync
│       └── dashboard/          # Dashboard stats
├── components/
│   ├── ui/                     # Shadcn base components
│   ├── layout/                 # Sidebar, Header, ThemeToggle
│   ├── dashboard/              # StatsCard, CampaignTable, Charts
│   ├── clients/                # ClientCard, ClientForm
│   ├── shared/                 # LoadingSpinner, EmptyState
│   └── providers/              # ThemeProvider
├── lib/
│   ├── auth.ts                 # NextAuth config
│   ├── prisma.ts               # DB singleton
│   ├── googleAds.ts            # Google Ads API integration
│   ├── metaAds.ts              # Meta Ads API integration
│   ├── alertEngine.ts          # Budget alert logic
│   └── utils.ts                # Formatting utilities
├── hooks/                      # React hooks (useClients, useAlerts, etc.)
├── types/                      # TypeScript types
└── prisma/
    ├── schema.prisma           # DB schema
    └── seed.ts                 # Demo data seed
```

---

## Syncing Campaign Data

### Manual sync (from UI)
Click the **Sync Now** button in the top-right header. This calls `POST /api/sync`.

### Automated sync (cron job)
Set up a cron job to call:

```bash
curl -X POST https://your-app.com/api/sync \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

Recommended: run every 6 hours.

---

## Audit sheets

The **Audit Sheets** page (`/audit`) builds the weekly PM audit automatically: one tab per
client in a fixed layout, plus a MENU tab. Ad numbers come from synced campaign daily stats
(last 90 days), CRM numbers from TeleCRM leads. Sync ads and TeleCRM before generating.

- **Download Excel** works with no extra setup.
- **Update Google Sheet** writes the same layout into a Google Sheet. Each run rewrites only
  the weeks you pick, keeps older weeks, and keeps the team's *Notes*, *Action* and MENU
  *Media Buyer* cells.

### One-time Google Sheets setup
1. In Google Cloud Console → create a project (or reuse one) → enable **Google Sheets API**.
2. IAM & Admin → Service Accounts → create one → Keys → Add key → JSON.
3. Add to `.env` (and your hosting env vars):
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=audit-bot@your-project.iam.gserviceaccount.com
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   AUDIT_SPREADSHEET_ID=   # optional default sheet (the ID from its URL)
   ```
4. Create a **new, empty** Google Sheet and share it with the service account email as **Editor**.
5. Paste the sheet link on the Audit Sheets page and click **Update Google Sheet**.

### Weekly automatic update
Every Monday morning (after the Sunday-night sync), call:

```bash
curl -X POST https://your-app.com/api/audit/sheet \
  -H "x-cron-secret: YOUR_CRON_SECRET" -H "Content-Type: application/json" -d '{}'
```

With an empty body it writes last week (Mon–Sun) for all active clients into `AUDIT_SPREADSHEET_ID`.

### How CRM stages map to columns
TeleCRM stage names differ per client, so they're grouped by keyword (`lib/audit/statusBuckets.ts`):
*Visited* (won, visited, consultation done…), *Appt Booked* (appointment, booked, scheduled, no-show —
the sheet's Appt Booked column also includes Visited), *RNR* (RNR, switched off…), *Not Interested*
(lost, disqualified, just curious…), *Out of Location*, *Other / Invalid* (wrong number, duplicate…),
*Interested / Call Back*, and *Not Yet Called* (Fresh / no stage). Edit the rules there to change it.

---

## API Integration

### Google Ads
The integration uses **Google Ads REST API v18** with OAuth2. You need:
1. A Google Ads manager (MCC) account
2. A developer token approved by Google
3. OAuth2 credentials for each client

See `/lib/googleAds.ts` for the integration layer.

### Meta Ads
Uses the **Meta Marketing API v21.0**. You need:
1. A Meta App with Marketing API access
2. A long-lived access token per ad account

See `/lib/metaAds.ts` for the integration layer.

---

## Alert System

Alerts are automatically created when:
- Campaign budget usage exceeds 80% → `WARNING`
- Campaign budget usage exceeds 90% → `CRITICAL`
- Campaign budget is exceeded (100%+) → `CRITICAL`
- Campaign is paused with active spend → `WARNING`
- CTR drops below 0.5% → `WARNING`
- Sync fails → `CRITICAL` sync error alert

Alerts are deduplicated: only one unread alert per campaign per type per 24 hours.

---

## Extending AdPulse

### Adding a new platform
1. Create `lib/yourPlatform.ts` with a `fetchYourPlatformCampaigns()` function
2. Add `YOURPLATFORM` to the `Platform` enum in `prisma/schema.prisma`
3. Update `app/api/sync/route.ts` to handle the new platform
4. Update platform labels/colors in `lib/utils.ts`

### Adding new metrics
1. Add columns to `Campaign` model in `schema.prisma`
2. Run `npm run db:migrate`
3. Update the API normalizer functions in `lib/googleAds.ts` / `lib/metaAds.ts`
4. Update `CampaignTable` component to show new columns

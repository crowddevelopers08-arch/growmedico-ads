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

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random 32+ char secret (use `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Your app URL |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | From Google Ads API Center |
| `GOOGLE_ADS_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | Google OAuth2 client secret |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Manager Account ID |
| `META_APP_ID` | Meta App ID |
| `META_APP_SECRET` | Meta App Secret |
| `CRON_SECRET` | Random secret for sync cron jobs |

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

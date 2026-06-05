# Base Coat Marketing Attribution Dashboard

Client-facing dashboard for the take-home challenge. It authenticates with the provided Supabase project, reports source-level leads, won revenue, Meta spend, and ROAS, and documents the planted tenant-isolation bug.

## Stack

- Next.js App Router
- Supabase Auth
- Supabase REST/RPC
- Recharts
- Plain CSS with a restrained dashboard UI

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment

The repo includes `.env.example` with the public Supabase config and the default dashboard date range.

For local development, copy it to `.env.local`. For Vercel/Netlify, add these same variables in the project environment settings:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
NEXT_PUBLIC_DASHBOARD_DEFAULT_START
NEXT_PUBLIC_DASHBOARD_DEFAULT_END
```

The default range is intentionally `2026-03-01` through `2026-06-05` because the dataset has records beyond March. March-only showed fewer rows by design; the wider default opens the dashboard with the full available test period.

Logins:

- Agency: `agency@skilltest.dev` / `Password123!`
- Client: `client-northpaw@skilltest.dev` / `Password123!`

## Data path

The intended dashboard data path is:

```ts
supabase.rpc('get_source_performance', { p_start, p_end })
```

The RPC SQL is in:

```text
supabase/migrations/202606050001_fix_meta_ads_metrics_tenant_isolation.sql
```

The provided Supabase project does not currently expose that RPC, so the Next.js API route includes a server-side fallback for the live demo. The fallback still derives tenant scope from the authenticated JWT user through `app_users`; it never trusts a frontend `client_id`.

## Apply the SQL

Run the migration in the Supabase SQL editor or with a linked project owner CLI:

```bash
npx supabase link --project-ref ansnstooqppdqiwrdqqi
npx supabase db push
```

After applying it, the dashboard will use the RPC path automatically.

## Attribution logic

Contacts are mapped to one source using this precedence:

1. UTM source, medium, and campaign.
2. `last_general_source`.
3. `source`.
4. Tags matched against `platform_tag_rules`.
5. `Unknown`.

Revenue is won opportunity value only. Open and lost opportunities are excluded. The date filter is based on contact `created_date`.

## Security bug

The planted bug is a cross-tenant direct read on `public.meta_ads_metrics`.

Before the migration, the Northpaw client can query Cedarline rows directly:

```text
/rest/v1/meta_ads_metrics?select=id,client_id&client_id=eq.b0000000-0000-0000-0000-000000000002
```

That returns 300 rows. The same Cedarline test returns zero rows for `clients`, `contacts`, `opportunities`, and `meta_ads_accounts`, which isolates the bug to `meta_ads_metrics` RLS/policy setup.

## Verification

```bash
npm run build
npm run scan:metrics
npm run test:security
```

`npm run test:security` is expected to fail until the migration is applied to the Supabase project. After applying it, the expected result is `Tenant isolation checks passed.`

## UI/UX & Premium Overhaul

This dashboard has been visually and interactively overhauled to match the premium corporate identity of **Base Coat Marketing**:
- **Branding & Logo**: Integrated the official brand logo and custom colors (Midnight Navy `#111625` & Gold `#fbb217`) across the layout.
- **Paint Roller Loading Screen**: Masked data fetching latency using a custom CSS paint roller animation with floating marketing particle indicators.
- **Source Badge System**: Color-coded attribution source tags (Google, Meta, SEO, Email, GLSA) for visual clarity.
- **Detailed Ads Metrics Sidebar**: Grouped detailed calculations into 4 rows inside the sidebar (Clicks, CTR, CPC, CPL, CRM attribution, Purchases, CPA) using a precise decimal formatter.
- **Local Table Client Filter**: Added a select dropdown next to the sort select box inside the table header to filter breakdown rows independently of global KPIs.

## Loom prep

- `LOOM_SCRIPT.md` has a 5-minute script.
- `docs/attribution-and-security-report.md` has the detailed implementation report.

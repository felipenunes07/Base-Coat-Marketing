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
npm run dev
```

Open `http://localhost:3000`.

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

## Loom prep

- `LOOM_SCRIPT.md` has a 5-minute script.
- `docs/attribution-and-security-report.md` has the detailed implementation report.

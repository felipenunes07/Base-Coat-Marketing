# Tenant isolation fix for meta_ads_metrics

## Root cause

The Supabase direct table path for `public.meta_ads_metrics` was not tenant-scoped like the other tenant tables. With the Northpaw client login, a direct REST query filtered to Cedarline returned 300 rows:

```text
/rest/v1/meta_ads_metrics?select=id,client_id&client_id=eq.b0000000-0000-0000-0000-000000000002
```

The same Cedarline filter returned zero rows for `clients`, `contacts`, `opportunities`, and `meta_ads_accounts`, so the leak is isolated to `meta_ads_metrics` RLS/policy configuration.

## Fix

`supabase/migrations/202606050001_fix_meta_ads_metrics_tenant_isolation.sql`:

- Enables and forces RLS on `public.meta_ads_metrics`.
- Drops existing policies on `meta_ads_metrics`.
- Revokes direct `anon` access.
- Adds a single authenticated select policy scoped through `public.app_users`.
- Creates `public.get_source_performance(p_start date, p_end date)` as a `SECURITY DEFINER` RPC that derives allowed clients from `auth.uid()`.

The dashboard must call `get_source_performance`; it should not query `meta_ads_metrics` directly.

## Verification

Run after applying the migration:

```bash
npm run test:security
npm run scan:metrics
```

The test uses the README anon key by default.

Expected manual checks:

- Northpaw client querying Cedarline `meta_ads_metrics`: zero rows.
- Northpaw client querying Northpaw `meta_ads_metrics`: rows visible.
- Agency user querying Cedarline `meta_ads_metrics`: rows visible.
- Northpaw RPC response includes only Northpaw `client_id`.
- Agency RPC response includes both seeded clients.

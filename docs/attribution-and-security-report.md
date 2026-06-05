# Attribution and security report

## Data model decisions

- Lead count is based on contacts created in the selected date range.
- Revenue is the sum of `opportunities.monetary_value` where `status = 'won'`.
- Meta spend is `spend_micros / 1,000,000`.
- ROAS is won revenue divided by Meta spend. Non-Meta sources show `N/A` when there is no spend.

## Attribution precedence

Contacts are mapped to one source using:

1. UTM source, medium, and campaign.
2. `last_general_source`.
3. `source`.
4. Tags matched to `platform_tag_rules`.
5. `Unknown`.

This favors structured campaign data first and uses noisier CRM labels as fallback.

## Security bug

The planted bug is a cross-tenant direct read on `public.meta_ads_metrics`.

Evidence before fix:

```text
Northpaw client -> Cedarline meta_ads_metrics rows: 300
Northpaw client -> Cedarline clients rows: 0
Northpaw client -> Cedarline contacts rows: 0
Northpaw client -> Cedarline opportunities rows: 0
Northpaw client -> Cedarline meta_ads_accounts rows: 0
```

Root cause: `meta_ads_metrics` was not protected by the same tenant-scoped RLS behavior as the other tenant tables.

## Fix

The migration `supabase/migrations/202606050001_fix_meta_ads_metrics_tenant_isolation.sql`:

- Enables and forces RLS on `public.meta_ads_metrics`.
- Drops existing policies on that table.
- Revokes direct `anon` table access.
- Grants authenticated select through a policy that checks `public.app_users`.
- Creates `public.get_source_performance(p_start date, p_end date)`.

## Verification commands

```bash
npm run build
npm run scan:metrics
npm run test:security
```

`npm run test:security` is expected to fail until the migration is applied to the Supabase project. After applying the migration, it should pass.

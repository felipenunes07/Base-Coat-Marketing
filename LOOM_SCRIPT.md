# Loom script, 5 minutes max

## 0:00-0:35 - What I built

I built a multi-client attribution dashboard for Base Coat Marketing. It authenticates against the provided Supabase project and shows leads, won revenue, Meta spend, and ROAS by source across a selected date range.

The agency login sees both Northpaw Plumbing and Cedarline Dental. The Northpaw client login is scoped to Northpaw only.

## 0:35-1:25 - Dashboard walkthrough

The top row shows total leads, won revenue, Meta spend, and blended ROAS for the current date range.

The chart gives a fast source-level view, and the table is the primary reporting surface. I kept the table dense and sortable because a client or operator needs to find a specific number quickly, not just look at summary cards.

The dashboard attempts to read from `public.get_source_performance(p_start date, p_end date)`. Because the provided public credentials cannot install database functions from the browser, the app includes a server-side fallback for the live demo. That fallback still derives tenant scope from the authenticated user and does not trust a frontend `client_id`.

## 1:25-2:20 - Attribution decisions

I map each contact to one source using this precedence:

1. UTM source, medium, and campaign.
2. `last_general_source`.
3. `source`.
4. CRM tags matched against `platform_tag_rules`.
5. `Unknown` if nothing reliable matches.

UTMs are first because they are the most structured campaign tracking signal. CRM fields come next, and tags are last because they are more likely to be inconsistent.

Revenue is only won opportunity value. Open and lost opportunities are excluded. The date filter is based on the contact `created_date`, so the report answers: "How did leads created in this period perform?"

## 2:20-3:30 - The planted security bug

The bug was in `public.meta_ads_metrics`. I logged in as the Northpaw client and queried Cedarline rows directly:

```text
/rest/v1/meta_ads_metrics?select=id,client_id&client_id=eq.b0000000-0000-0000-0000-000000000002
```

That returned 300 Cedarline rows. The same Cedarline test returned zero rows for `clients`, `contacts`, `opportunities`, and `meta_ads_accounts`, so the leak was isolated to the metrics table policy.

The fix is in the migration file. It enables and forces RLS on `meta_ads_metrics`, revokes `anon`, drops permissive policies, and adds a tenant-scoped select policy based on `app_users` and `auth.uid()`.

## 3:30-4:25 - RPC and defensive backend

The SQL migration also creates `public.get_source_performance(p_start date, p_end date)` as a `SECURITY DEFINER` function with a fixed search path.

The function derives allowed clients from the authenticated user. Agency users can aggregate all clients. Client users can aggregate only their assigned client. The frontend does not pass `client_id`, and the backend does not trust one.

## 4:25-5:00 - Sanity checks

I created `npm run test:security` to verify the important isolation cases:

- Northpaw cannot directly read Cedarline metrics.
- Northpaw can read its own metrics.
- Agency can read Cedarline metrics.
- Northpaw RPC returns only Northpaw client IDs.
- Agency RPC includes both clients.

I also added `npm run scan:metrics` to catch accidental direct `meta_ads_metrics` queries outside reviewed SQL, tests, docs, or the scoped server data module.

begin;

alter table public.meta_ads_metrics enable row level security;
alter table public.meta_ads_metrics force row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'meta_ads_metrics'
  loop
    execute format('drop policy if exists %I on public.meta_ads_metrics', policy_record.policyname);
  end loop;
end $$;

revoke all on table public.meta_ads_metrics from anon;
grant select on table public.meta_ads_metrics to authenticated;

create policy "tenant scoped meta ads metrics select"
on public.meta_ads_metrics
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.user_id = (select auth.uid())
      and (
        au.role = 'agency'
        or au.client_id = meta_ads_metrics.client_id
      )
  )
);

create or replace function public.get_source_performance(p_start date, p_end date)
returns table (
  client_id uuid,
  client_name text,
  source_key text,
  source text,
  leads bigint,
  won_revenue numeric,
  spend numeric,
  roas numeric,
  meta_reported_leads bigint,
  clicks bigint,
  impressions bigint,
  purchases bigint
)
language sql
security definer
set search_path = ''
as $$
  with current_app_user as (
    select au.role, au.client_id
    from public.app_users au
    where au.user_id = (select auth.uid())
    limit 1
  ),
  allowed_clients as (
    select c.id, c.name
    from public.clients c
    join current_app_user au
      on au.role = 'agency'
      or au.client_id = c.id
  ),
  contact_revenue as (
    select
      c.id,
      c.client_id,
      coalesce(
        (
          select sum(o.monetary_value)
          from public.opportunities o
          where o.contact_id = c.id
            and o.client_id = c.client_id
            and o.status = 'won'
        ),
        0
      ) as won_revenue,
      coalesce(c.utm_source, '') as utm_source,
      coalesce(c.utm_medium, '') as utm_medium,
      coalesce(c.utm_campaign, '') as utm_campaign,
      coalesce(c.last_general_source, '') as last_general_source,
      coalesce(c.source, '') as source,
      coalesce(array_to_string(c.tags, ' '), '') as tags
    from public.contacts c
    join allowed_clients ac on ac.id = c.client_id
    where c.created_date >= p_start
      and c.created_date <= p_end
  ),
  contact_signals as (
    select
      cr.id,
      cr.client_id,
      cr.won_revenue,
      signals.rank,
      signals.value
    from contact_revenue cr
    cross join lateral (
      values
        (1, concat_ws(' ', cr.utm_source, cr.utm_medium, cr.utm_campaign)),
        (2, cr.last_general_source),
        (3, cr.source),
        (4, cr.tags)
    ) as signals(rank, value)
    where nullif(trim(signals.value), '') is not null
  ),
  attributed_contacts as (
    select
      cr.id,
      cr.client_id,
      cr.won_revenue,
      coalesce(matched_rule.platform, 'unknown') as source_key
    from contact_revenue cr
    left join lateral (
      select ptr.platform
      from contact_signals cs
      join public.platform_tag_rules ptr
        on exists (
          select 1
          from unnest(ptr.keywords) as keyword
          where cs.value ilike '%' || keyword || '%'
        )
      where cs.id = cr.id
      order by cs.rank, ptr.platform
      limit 1
    ) matched_rule on true
  ),
  lead_summary as (
    select
      ac.client_id,
      ac.source_key,
      count(*)::bigint as leads,
      sum(ac.won_revenue)::numeric as won_revenue
    from attributed_contacts ac
    group by ac.client_id, ac.source_key
  ),
  spend_summary as (
    select
      m.client_id,
      'meta_ads'::text as source_key,
      (sum(m.spend_micros)::numeric / 1000000)::numeric as spend,
      sum(m.leads)::bigint as meta_reported_leads,
      sum(m.clicks)::bigint as clicks,
      sum(m.impressions)::bigint as impressions,
      sum(m.purchases)::bigint as purchases
    from public.meta_ads_metrics m
    join allowed_clients ac on ac.id = m.client_id
    where m.date >= p_start
      and m.date <= p_end
    group by m.client_id
  ),
  source_rows as (
    select client_id, source_key from lead_summary
    union
    select client_id, source_key from spend_summary
  )
  select
    ac.id as client_id,
    ac.name as client_name,
    sr.source_key,
    case sr.source_key
      when 'meta_ads' then 'Meta'
      when 'google_ads' then 'Google'
      when 'glsa' then 'GLSA'
      when 'seo' then 'SEO'
      when 'email' then 'Email'
      else 'Unknown'
    end as source,
    coalesce(ls.leads, 0)::bigint as leads,
    coalesce(ls.won_revenue, 0)::numeric as won_revenue,
    coalesce(ss.spend, 0)::numeric as spend,
    case
      when coalesce(ss.spend, 0) > 0 then round(coalesce(ls.won_revenue, 0) / ss.spend, 2)
      else null
    end as roas,
    coalesce(ss.meta_reported_leads, 0)::bigint as meta_reported_leads,
    coalesce(ss.clicks, 0)::bigint as clicks,
    coalesce(ss.impressions, 0)::bigint as impressions,
    coalesce(ss.purchases, 0)::bigint as purchases
  from source_rows sr
  join allowed_clients ac on ac.id = sr.client_id
  left join lead_summary ls
    on ls.client_id = sr.client_id
   and ls.source_key = sr.source_key
  left join spend_summary ss
    on ss.client_id = sr.client_id
   and ss.source_key = sr.source_key
  order by ac.name, leads desc, won_revenue desc, source;
$$;

revoke all on function public.get_source_performance(date, date) from public;
revoke all on function public.get_source_performance(date, date) from anon;
grant execute on function public.get_source_performance(date, date) to authenticated;

commit;

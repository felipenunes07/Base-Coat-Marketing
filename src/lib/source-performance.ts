import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/constants';

export type SourcePerformanceRow = {
  client_id: string;
  client_name: string;
  source_key: string;
  source: string;
  leads: number;
  won_revenue: number;
  spend: number;
  roas: number | null;
  meta_reported_leads: number;
  clicks: number;
  impressions: number;
  purchases: number;
};

export type AppUser = { role: 'agency' | 'client'; client_id: string | null };
export type Client = { id: string; name: string };
export type Contact = {
  id: string;
  client_id: string;
  source: string | null;
  last_general_source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  tags: string[] | null;
  created_date?: string;
};
export type Opportunity = { contact_id: string; client_id: string; monetary_value: number; status: string };
export type Metric = {
  client_id: string;
  spend_micros: number;
  leads: number;
  clicks: number;
  impressions: number;
  purchases: number;
};
export type PlatformRule = { platform: string; keywords: string[] };

export type PerformanceResponse = {
  rows: SourcePerformanceRow[];
  dataPath: 'rpc' | 'server_fallback';
  warning?: string;
};

function serverClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function sourceLabel(sourceKey: string | null | undefined, fallback?: string | null) {
  const normalized = String(sourceKey ?? '').trim().toLowerCase();
  const labels: Record<string, string> = {
    meta_ads: 'Meta',
    google_ads: 'Google',
    glsa: 'GLSA',
    seo: 'SEO',
    email: 'Email',
    unknown: 'Unknown'
  };

  if (labels[normalized]) return labels[normalized];
  if (fallback?.trim()) return fallback.trim();
  return normalized ? normalized.replaceAll('_', ' ') : 'Unknown';
}

function toNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export function attributeContact(contact: Contact, rules: PlatformRule[]) {
  const signals = [
    [contact.utm_source, contact.utm_medium, contact.utm_campaign].filter(Boolean).join(' '),
    contact.last_general_source,
    contact.source,
    contact.tags?.join(' ') ?? ''
  ];

  for (const signal of signals) {
    const normalized = signal?.trim().toLowerCase();
    if (!normalized) continue;

    const match = rules.find((rule) =>
      rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
    );
    if (match) return match.platform;
  }

  return 'unknown';
}

function normalizeRows(rows: SourcePerformanceRow[]) {
  return rows.map((row) => {
    const normalizedSourceKey = String(row.source_key ?? 'unknown').trim().toLowerCase();

    return {
      ...row,
      source_key: normalizedSourceKey,
      source: sourceLabel(normalizedSourceKey, row.source),
      leads: toNumber(row.leads),
      won_revenue: toNumber(row.won_revenue),
      spend: toNumber(row.spend),
      roas: row.roas === null ? null : toNumber(row.roas),
      meta_reported_leads: toNumber(row.meta_reported_leads),
      clicks: toNumber(row.clicks),
      impressions: toNumber(row.impressions),
      purchases: toNumber(row.purchases)
    };
  });
}

export async function getSourcePerformance(
  accessToken: string,
  start: string,
  end: string
): Promise<PerformanceResponse> {
  const supabase = serverClient(accessToken);

  const rpcResult = await supabase.rpc('get_source_performance', { p_start: start, p_end: end });
  if (!rpcResult.error && rpcResult.data) {
    return { rows: normalizeRows(rpcResult.data as SourcePerformanceRow[]), dataPath: 'rpc' };
  }

  const rows = await getFallbackPerformance(supabase, start, end);
  return {
    rows,
    dataPath: 'server_fallback',
    warning:
      'RPC is not installed in the provided Supabase project yet. The app is using a server-side fallback scoped from the authenticated user.'
  };
}

async function getFallbackPerformance(
  supabase: ReturnType<typeof serverClient>,
  start: string,
  end: string
) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Unable to resolve authenticated user.');

  const { data: appUser, error: appUserError } = await supabase
    .from('app_users')
    .select('role, client_id')
    .eq('user_id', userData.user.id)
    .single<AppUser>();
  if (appUserError || !appUser) throw new Error('User is not mapped in app_users.');

  const { data: clients, error: clientsError } =
    appUser.role === 'agency'
      ? await supabase.from('clients').select('id, name').returns<Client[]>()
      : await supabase
          .from('clients')
          .select('id, name')
          .eq('id', appUser.client_id ?? '')
          .returns<Client[]>();
  if (clientsError) throw new Error(clientsError.message);

  const allowedIds = new Set((clients ?? []).map((client) => client.id));
  const clientNames = new Map((clients ?? []).map((client) => [client.id, client.name]));
  if (allowedIds.size === 0) return [];

  const allowedList = Array.from(allowedIds);
  const [contactsResult, opportunitiesResult, metricsResult, rulesResult] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, client_id, source, last_general_source, utm_source, utm_medium, utm_campaign, tags')
      .gte('created_date', start)
      .lte('created_date', end)
      .in('client_id', allowedList)
      .returns<Contact[]>(),
    supabase
      .from('opportunities')
      .select('contact_id, client_id, monetary_value, status')
      .eq('status', 'won')
      .in('client_id', allowedList)
      .returns<Opportunity[]>(),
    supabase
      .from('meta_ads_metrics')
      .select('client_id, spend_micros, leads, clicks, impressions, purchases')
      .gte('date', start)
      .lte('date', end)
      .in('client_id', allowedList)
      .returns<Metric[]>(),
    supabase.from('platform_tag_rules').select('platform, keywords').returns<PlatformRule[]>()
  ]);

  for (const result of [contactsResult, opportunitiesResult, metricsResult, rulesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const revenueByContact = new Map<string, number>();
  for (const opportunity of opportunitiesResult.data ?? []) {
    if (!allowedIds.has(opportunity.client_id)) continue;
    revenueByContact.set(
      opportunity.contact_id,
      (revenueByContact.get(opportunity.contact_id) ?? 0) + toNumber(opportunity.monetary_value)
    );
  }

  const rowMap = new Map<string, SourcePerformanceRow>();
  const getRow = (clientId: string, sourceKey: string) => {
    const normalizedSourceKey = String(sourceKey ?? 'unknown').trim().toLowerCase();
    const key = `${clientId}:${normalizedSourceKey}`;
    const existing = rowMap.get(key);
    if (existing) return existing;
    const row: SourcePerformanceRow = {
      client_id: clientId,
      client_name: clientNames.get(clientId) ?? 'Unknown client',
      source_key: normalizedSourceKey,
      source: sourceLabel(normalizedSourceKey),
      leads: 0,
      won_revenue: 0,
      spend: 0,
      roas: null,
      meta_reported_leads: 0,
      clicks: 0,
      impressions: 0,
      purchases: 0
    };
    rowMap.set(key, row);
    return row;
  };

  for (const contact of contactsResult.data ?? []) {
    if (!allowedIds.has(contact.client_id)) continue;
    const row = getRow(contact.client_id, attributeContact(contact, rulesResult.data ?? []));
    row.leads += 1;
    row.won_revenue += revenueByContact.get(contact.id) ?? 0;
  }

  for (const metric of metricsResult.data ?? []) {
    if (!allowedIds.has(metric.client_id)) continue;
    const row = getRow(metric.client_id, 'meta_ads');
    row.spend += toNumber(metric.spend_micros) / 1_000_000;
    row.meta_reported_leads += toNumber(metric.leads);
    row.clicks += toNumber(metric.clicks);
    row.impressions += toNumber(metric.impressions);
    row.purchases += toNumber(metric.purchases);
  }

  return Array.from(rowMap.values())
    .map((row) => ({ ...row, roas: row.spend > 0 ? Number((row.won_revenue / row.spend).toFixed(2)) : null }))
    .sort((a, b) => a.client_name.localeCompare(b.client_name) || b.leads - a.leads);
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import {
  ArrowDownUp,
  BarChart3,
  Building2,
  CalendarDays,
  DollarSign,
  LogOut,
  MousePointerClick,
  ShieldCheck,
  Target,
  TrendingUp,
  Users
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend
} from 'recharts';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { sourceLabel, type SourcePerformanceRow } from '@/lib/source-performance';
import { compact, money, roas, moneyWithCents } from '@/lib/format';

const supabase = createBrowserSupabaseClient();

type SortKey = 'leads' | 'won_revenue' | 'spend' | 'roas';

const defaultStart = process.env.NEXT_PUBLIC_DASHBOARD_DEFAULT_START ?? '2026-03-01';
const defaultEnd = process.env.NEXT_PUBLIC_DASHBOARD_DEFAULT_END ?? '2026-06-05';

function displaySource(row: Pick<SourcePerformanceRow, 'source' | 'source_key'>) {
  return sourceLabel(row.source_key, row.source);
}

export default function DashboardApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('agency@skilltest.dev');
  const [password, setPassword] = useState('Password123!');
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [rows, setRows] = useState<SourcePerformanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('leads');
  const [selectedClient, setSelectedClient] = useState('all');
  const [tableClient, setTableClient] = useState('all');
  
  // Custom navigation tab state
  const [activeTab, setActiveTab] = useState<string>('blended');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadData(session.access_token, start, end);
  }, [session, start, end]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (signInError) setError(signInError.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setRows([]);
    setSelectedClient('all');
    setActiveTab('blended');
  }

  async function loadData(token: string, nextStart: string, nextEnd: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/source-performance?start=${nextStart}&end=${nextEnd}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load dashboard data.');
      setRows(payload.rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }

  const clientOptions = useMemo(() => {
    const clients = new Map<string, string>();
    for (const row of rows) {
      clients.set(row.client_id, row.client_name);
    }

    return Array.from(clients.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  useEffect(() => {
    if (selectedClient === 'all') return;
    if (!clientOptions.some((client) => client.id === selectedClient)) {
      setSelectedClient('all');
    }
  }, [clientOptions, selectedClient]);

  useEffect(() => {
    if (tableClient === 'all') return;
    if (!clientOptions.some((client) => client.id === tableClient)) {
      setTableClient('all');
    }
  }, [clientOptions, tableClient]);

  const visibleRows = useMemo(() => {
    if (selectedClient === 'all') return rows;
    return rows.filter((row) => row.client_id === selectedClient);
  }, [rows, selectedClient]);

  const sortedRows = useMemo(() => {
    return [...visibleRows].sort((a, b) => {
      if (a.client_name !== b.client_name) return a.client_name.localeCompare(b.client_name);
      const left = sortKey === 'roas' ? a.roas ?? -1 : a[sortKey];
      const right = sortKey === 'roas' ? b.roas ?? -1 : b[sortKey];
      return right - left;
    });
  }, [visibleRows, sortKey]);

  const tableRows = useMemo(() => {
    let filtered = sortedRows;
    if (activeTab !== 'blended') {
      filtered = filtered.filter((row) => row.source_key === activeTab);
    }
    if (tableClient === 'all') return filtered;
    return filtered.filter((row) => row.client_id === tableClient);
  }, [sortedRows, activeTab, tableClient]);

  // Aggregate metrics based on the current selection and active tab
  const channelTotals = useMemo(() => {
    const rowsToUse = activeTab === 'blended'
      ? visibleRows
      : visibleRows.filter((row) => row.source_key === activeTab);

    return rowsToUse.reduce(
      (acc, row) => {
        acc.leads += row.leads;
        acc.revenue += row.won_revenue;
        acc.spend += row.spend;
        acc.clicks += row.clicks;
        acc.metaLeads += row.meta_reported_leads;
        acc.purchases += row.purchases;
        acc.impressions += row.impressions || 0;
        return acc;
      },
      { leads: 0, revenue: 0, spend: 0, clicks: 0, metaLeads: 0, purchases: 0, impressions: 0 }
    );
  }, [visibleRows, activeTab]);

  const channelBlendedRoas = channelTotals.spend > 0 ? channelTotals.revenue / channelTotals.spend : null;
  const channelRevenuePerLead = channelTotals.leads > 0 ? channelTotals.revenue / channelTotals.leads : null;
  const channelCpl = channelTotals.leads > 0 ? channelTotals.spend / channelTotals.leads : null;

  // Meta Ads specific metrics
  const channelMetaCtr = channelTotals.impressions > 0 ? (channelTotals.clicks / channelTotals.impressions) * 100 : 0;
  const channelMetaCpc = channelTotals.clicks > 0 ? channelTotals.spend / channelTotals.clicks : null;
  const channelMetaCpa = channelTotals.purchases > 0 ? channelTotals.spend / channelTotals.purchases : null;
  const channelCostPerMetaLead = channelTotals.metaLeads > 0 ? channelTotals.spend / channelTotals.metaLeads : null;

  const isAgency = clientOptions.length > 1;
  const scopeLabel =
    selectedClient === 'all'
      ? isAgency
        ? 'All clients'
        : clientOptions[0]?.name ?? 'Client account'
      : clientOptions.find((client) => client.id === selectedClient)?.name ?? 'Selected client';

  // Contextual column toggle for client scope
  const showClientColumn = isAgency && selectedClient === 'all';

  // Client summaries filtered by channel for comparison tiles
  const channelClientSummaries = useMemo(() => {
    const summaryMap = new Map<
      string,
      { id: string; name: string; leads: number; revenue: number; spend: number; clicks: number; metaLeads: number }
    >();

    const rowsToUse = activeTab === 'blended'
      ? rows
      : rows.filter((row) => row.source_key === activeTab);

    for (const row of rowsToUse) {
      const summary =
        summaryMap.get(row.client_id) ??
        { id: row.client_id, name: row.client_name, leads: 0, revenue: 0, spend: 0, clicks: 0, metaLeads: 0 };
      summary.leads += row.leads;
      summary.revenue += row.won_revenue;
      summary.spend += row.spend;
      summary.clicks += row.clicks;
      summary.metaLeads += row.meta_reported_leads;
      summaryMap.set(row.client_id, summary);
    }

    return Array.from(summaryMap.values()).sort((a, b) => b.revenue - a.revenue);
  }, [rows, activeTab]);

  const sourceInsights = useMemo(
    () =>
      [...visibleRows]
        .sort((a, b) => b.won_revenue - a.won_revenue || b.leads - a.leads)
        .slice(0, 4),
    [visibleRows]
  );

  // Grouped charts rows
  const chartRows = useMemo(() => {
    if (activeTab === 'blended') {
      const grouped = visibleRows.reduce((map, row) => {
        const source = displaySource(row);
        const current = map.get(source) ?? { name: source, leads: 0, revenue: 0, spend: 0, metaLeads: 0 };
        current.leads += row.leads;
        current.revenue += row.won_revenue;
        current.spend += row.spend;
        current.metaLeads += row.meta_reported_leads;
        map.set(source, current);
        return map;
      }, new Map<string, { name: string; leads: number; revenue: number; spend: number; metaLeads: number }>());
      return Array.from(grouped.values()).sort((a, b) => b.leads - a.leads);
    } else {
      // Group by client name for the selected channel
      const grouped = visibleRows
        .filter((row) => row.source_key === activeTab)
        .reduce((map, row) => {
          const client = row.client_name;
          const current = map.get(client) ?? { name: client, leads: 0, revenue: 0, spend: 0, metaLeads: 0 };
          current.leads += row.leads;
          current.revenue += row.won_revenue;
          current.spend += row.spend;
          current.metaLeads += row.meta_reported_leads;
          map.set(client, current);
          return map;
        }, new Map<string, { name: string; leads: number; revenue: number; spend: number; metaLeads: number }>());
      return Array.from(grouped.values()).sort((a, b) => b.leads - a.leads);
    }
  }, [visibleRows, activeTab]);

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-visual">
          <div className="login-brand">
            <img src="/logo-icon.png" alt="Base Coat Marketing Logo" className="brand-logo-img" />
            <span>Base Coat Reporting</span>
          </div>
          <div className="login-preview">
            <p className="eyebrow">Performance workspace</p>
            <h1>Attribution reporting for agency and client views.</h1>
            <div className="login-facts">
              <span>CRM leads</span>
              <span>Won revenue</span>
              <span>Meta spend</span>
              <span>ROAS</span>
            </div>
          </div>
        </section>
        <form className="login-panel" onSubmit={signIn}>
          <div>
            <p className="eyebrow">Secure dashboard</p>
            <h2>Sign in</h2>
            <p className="form-copy">Use one of the test accounts from the assignment.</p>
          </div>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="login-shortcuts">
            <button type="button" onClick={() => setEmail('agency@skilltest.dev')}>Agency view</button>
            <button type="button" onClick={() => setEmail('client-northpaw@skilltest.dev')}>Northpaw client</button>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="primary-button" disabled={authLoading}>
            {authLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </main>
    );
  }

  // --- Sub-Dashboard Renderers ---

  function renderBlendedDashboard() {
    return (
      <>
        {/* KPI Cards Grid */}
        <section className="kpi-grid">
          <Metric label="CRM Leads" value={compact(channelTotals.leads)} icon={<Users size={18} />} />
          <Metric label="Won Revenue" value={money(channelTotals.revenue)} icon={<DollarSign size={18} />} />
          <Metric label="Total Spend" value={money(channelTotals.spend)} icon={<BarChart3 size={18} />} />
          <Metric label="Blended ROAS" value={roas(channelBlendedRoas)} icon={<TrendingUp size={18} />} />
          <Metric label="Revenue / Lead" value={channelRevenuePerLead ? money(channelRevenuePerLead) : 'N/A'} icon={<Target size={18} />} />
          <Metric label="Blended CPL" value={channelCpl ? moneyWithCents(channelCpl) : 'N/A'} icon={<DollarSign size={18} />} />
        </section>

        {/* Client Comparison for Agency Overview */}
        {isAgency && selectedClient === 'all' && (
          <section className="client-comparison">
            <div className="section-heading">
              <p className="eyebrow">Agency Overview</p>
              <h2>Client Comparison (Blended)</h2>
            </div>
            <div className="client-grid">
              {channelClientSummaries.map((client) => {
                const clientRoas = client.spend > 0 ? client.revenue / client.spend : null;
                return (
                  <button
                    className="client-tile"
                    key={client.id}
                    onClick={() => setSelectedClient(client.id)}
                    type="button"
                  >
                    <span>{client.name}</span>
                    <strong>{money(client.revenue)}</strong>
                    <small>{compact(client.leads)} leads · {money(client.spend)} spend · {roas(clientRoas)} ROAS</small>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Visual Charts & Channel Summary */}
        <section className="workspace">
          <div className="chart-panel">
            <div className="section-heading">
              <p className="eyebrow">Attribution Split</p>
              <h2>Leads & Revenue by Channel</h2>
            </div>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartRows} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbb217" stopOpacity={1} />
                      <stop offset="100%" stopColor="#d9930c" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e293b" stopOpacity={1} />
                      <stop offset="100%" stopColor="#0f172a" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', borderRadius: '8px', border: 'none', color: 'white' }}
                    labelStyle={{ fontWeight: 'bold', color: '#fbb217' }}
                    formatter={(value, name) =>
                      name === 'Revenue' ? [money(Number(value)), 'Won Revenue'] : [compact(Number(value)), 'CRM Leads']
                    }
                  />
                  <Legend iconType="circle" />
                  <Bar yAxisId="left" dataKey="leads" name="Leads" fill="url(#leadsGradient)" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar yAxisId="right" dataKey="revenue" name="Revenue" fill="url(#revenueGradient)" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <aside className="channel-share-panel">
            <p className="eyebrow">Channel Share</p>
            <h2>Distribution</h2>
            <div className="channel-share-list">
              {chartRows.map((row) => {
                const leadsPct = channelTotals.leads > 0 ? (row.leads / channelTotals.leads) * 100 : 0;
                const revPct = channelTotals.revenue > 0 ? (row.revenue / channelTotals.revenue) * 100 : 0;
                const key = row.name.toLowerCase().replace(' ', '_');
                return (
                  <div key={row.name} className="channel-share-row">
                    <div className="channel-share-info">
                      <span className={`channel-indicator-badge ${key}`}>{row.name}</span>
                      <span className="channel-share-values">
                        {row.leads} leads ({leadsPct.toFixed(0)}%) · {money(row.revenue)}
                      </span>
                    </div>
                    <div className="channel-share-bar-container">
                      <div className="channel-share-bar rev" style={{ width: `${revPct}%` }} title={`Revenue Share: ${revPct.toFixed(1)}%`}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>

        {/* Insight readout */}
        <section className="insight-section">
          <div className="section-heading">
            <p className="eyebrow">Source Readout</p>
            <h2>What is driving the report</h2>
          </div>
          <div className="insight-grid">
            {sourceInsights.map((row) => {
              const revenuePerLead = row.leads > 0 ? row.won_revenue / row.leads : 0;
              return (
                <div className="insight-tile" key={`${row.client_id}-${row.source_key}-insight`}>
                  <div>
                    <span className={`source-pill ${row.source_key}`}>{displaySource(row)}</span>
                    <p>{row.client_name}</p>
                  </div>
                  <strong>{money(row.won_revenue)}</strong>
                  <small>
                    {compact(row.leads)} leads · {money(revenuePerLead)} / lead
                  </small>
                </div>
              );
            })}
          </div>
        </section>

        {/* Breakdown Table */}
        {renderTableSection()}
      </>
    );
  }

  function renderMetaDashboard() {
    return (
      <>
        {/* Intro banner */}
        <div className="channel-intro-banner meta">
          <div className="banner-logo">🔵</div>
          <div className="banner-text">
            <h3>Meta Ads Performance Workspace</h3>
            <p>Direct API metrics compared with CRM lead tracking and closed-won opportunity attribution.</p>
          </div>
        </div>

        {/* KPI Subgrids grouped logically */}
        <div className="meta-kpi-groups">
          <div className="kpi-group-card">
            <h4>💰 Financial Performance</h4>
            <div className="kpi-subgrid-dense">
              <div className="dense-kpi">
                <span className="dense-label">Won Revenue</span>
                <strong className="dense-value">{money(channelTotals.revenue)}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">Meta Spend</span>
                <strong className="dense-value">{money(channelTotals.spend)}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">Platform ROAS</span>
                <strong className="dense-value highlight-gold">{roas(channelBlendedRoas)}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">Rev / CRM Lead</span>
                <strong className="dense-value">{channelRevenuePerLead ? money(channelRevenuePerLead) : 'N/A'}</strong>
              </div>
            </div>
          </div>

          <div className="kpi-group-card">
            <h4>⚡ Funnel & Ad Delivery</h4>
            <div className="kpi-subgrid-dense">
              <div className="dense-kpi">
                <span className="dense-label">Impressions</span>
                <strong className="dense-value">{compact(channelTotals.impressions)}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">Clicks</span>
                <strong className="dense-value">{compact(channelTotals.clicks)}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">CTR</span>
                <strong className="dense-value">{channelMetaCtr > 0 ? `${channelMetaCtr.toFixed(2)}%` : '0%'}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">CPC</span>
                <strong className="dense-value">{moneyWithCents(channelMetaCpc)}</strong>
              </div>
            </div>
          </div>

          <div className="kpi-group-card">
            <h4>🎯 Conversions & Attribution</h4>
            <div className="kpi-subgrid-dense">
              <div className="dense-kpi">
                <span className="dense-label">Meta Reported Leads</span>
                <strong className="dense-value">{compact(channelTotals.metaLeads)}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">CRM Tracked Leads</span>
                <strong className="dense-value">{compact(channelTotals.leads)}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">CPL (Meta reported)</span>
                <strong className="dense-value">{moneyWithCents(channelCostPerMetaLead)}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">CRM CPL</span>
                <strong className="dense-value">
                  {channelTotals.leads > 0 ? moneyWithCents(channelTotals.spend / channelTotals.leads) : 'N/A'}
                </strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">Purchases</span>
                <strong className="dense-value">{compact(channelTotals.purchases)}</strong>
              </div>
              <div className="dense-kpi">
                <span className="dense-label">CPA</span>
                <strong className="dense-value">{moneyWithCents(channelMetaCpa)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Client comparison for Meta Ads (only if agency & selectedClient === 'all') */}
        {isAgency && selectedClient === 'all' && (
          <section className="client-comparison">
            <div className="section-heading">
              <p className="eyebrow">Agency Overview</p>
              <h2>Client Comparison (Meta Ads Only)</h2>
            </div>
            <div className="client-grid">
              {channelClientSummaries.map((client) => {
                const clientRoas = client.spend > 0 ? client.revenue / client.spend : null;
                return (
                  <button
                    className="client-tile"
                    key={client.id}
                    onClick={() => setSelectedClient(client.id)}
                    type="button"
                  >
                    <span>{client.name}</span>
                    <strong>{money(client.revenue)}</strong>
                    <small>
                      {compact(client.leads)} CRM leads · {compact(client.metaLeads)} Meta leads · {money(client.spend)} spend · {roas(clientRoas)} ROAS
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Visual Attribution Split (CRM vs Meta reported) */}
        <section className="workspace">
          <div className="chart-panel">
            <div className="section-heading">
              <p className="eyebrow">Attribution Gap</p>
              <h2>CRM Tracked Leads vs Meta Reported Leads</h2>
            </div>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartRows} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="crmLeadsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0866ff" stopOpacity={1} />
                      <stop offset="100%" stopColor="#044bbd" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="metaLeadsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbb217" stopOpacity={1} />
                      <stop offset="100%" stopColor="#d9930c" stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', borderRadius: '8px', border: 'none', color: 'white' }}
                    labelStyle={{ fontWeight: 'bold', color: '#0866ff' }}
                    formatter={(value, name) => [compact(Number(value)), name]}
                  />
                  <Legend iconType="circle" />
                  <Bar dataKey="leads" name="CRM Tracked Leads" fill="url(#crmLeadsGradient)" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="metaLeads" name="Meta Reported Leads" fill="url(#metaLeadsGradient)" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <aside className="meta-panel-redesigned">
            <p className="eyebrow">Efficiency Summary</p>
            <h2>Meta ROI Status</h2>
            <div className="meta-ring-redesigned">
              <span>{roas(channelBlendedRoas)}</span>
              <small>blended ROAS</small>
            </div>
            <div className="meta-ratio-bar">
              <span className="ratio-title">Attribution Matching Ratio</span>
              <div className="ratio-value">
                {channelTotals.metaLeads > 0 
                  ? `${((channelTotals.leads / channelTotals.metaLeads) * 100).toFixed(1)}%` 
                  : '0.0%'}
              </div>
              <p className="ratio-subtitle">CRM tracked leads vs Meta Ads self-reported conversions.</p>
            </div>
          </aside>
        </section>

        {renderTableSection()}
      </>
    );
  }

  function renderGeneralChannelDashboard() {
    const channelName = sourceLabel(activeTab);
    
    const getChannelDescription = () => {
      switch (activeTab) {
        case 'google_ads':
          return {
            title: 'Google Ads Search Network',
            desc: 'Paid Google search traffic tracked via UTM tagging and CRM ingestion. Helps monitor lead generation and client revenue from Google search campaigns.',
            icon: '🟡',
            accent: 'google'
          };
        case 'glsa':
          return {
            title: 'Google Local Services Ads (GLSA)',
            desc: 'Pay-per-lead phone calls and bookings verified by Google. Focuses on hyper-local client requests and direct call attribution.',
            icon: '🟢',
            accent: 'glsa'
          };
        case 'seo':
          return {
            title: 'Search Engine Optimization (Organic SEO)',
            desc: 'Non-paid organic search query acquisitions. All leads and opportunities are driven naturally, carrying zero advertising costs and yielding optimal profit margins.',
            icon: '🟣',
            accent: 'seo'
          };
        case 'email':
          return {
            title: 'Email Outreach & Newsletters',
            desc: 'Attributed leads originating from outbound prospect lists, newsletter campaigns, and customer retention flows.',
            icon: '✉️',
            accent: 'email'
          };
        default:
          return {
            title: 'Direct / Unattributed traffic',
            desc: 'Direct website entries, general word-of-mouth referrers, or client walk-ins lacking campaign tracking parameters.',
            icon: '⚙️',
            accent: 'unknown'
          };
      }
    };
    
    const channelInfo = getChannelDescription();

    return (
      <>
        {/* Banner */}
        <div className={`channel-intro-banner ${channelInfo.accent}`}>
          <div className="banner-logo">{channelInfo.icon}</div>
          <div className="banner-text">
            <h3>{channelInfo.title}</h3>
            <p>{channelInfo.desc}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <section className="kpi-grid-three">
          <Metric label="CRM Tracked Leads" value={compact(channelTotals.leads)} icon={<Users size={18} />} />
          <Metric label="Won Revenue" value={money(channelTotals.revenue)} icon={<DollarSign size={18} />} />
          <Metric label="Revenue / Lead" value={channelRevenuePerLead ? money(channelRevenuePerLead) : 'N/A'} icon={<Target size={18} />} />
        </section>

        {/* Client Comparison for Agency */}
        {isAgency && selectedClient === 'all' && (
          <section className="client-comparison">
            <div className="section-heading">
              <p className="eyebrow">Agency Overview</p>
              <h2>Client Performance Comparison</h2>
            </div>
            <div className="client-grid">
              {channelClientSummaries.map((client) => {
                const revPerLead = client.leads > 0 ? client.revenue / client.leads : 0;
                return (
                  <button
                    className="client-tile"
                    key={client.id}
                    onClick={() => setSelectedClient(client.id)}
                    type="button"
                  >
                    <span>{client.name}</span>
                    <strong>{money(client.revenue)}</strong>
                    <small>{compact(client.leads)} leads · {money(revPerLead)} / lead</small>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Chart */}
        <section className="workspace-single">
          <div className="chart-panel">
            <div className="section-heading">
              <p className="eyebrow">{channelName} Breakdown</p>
              <h2>Leads & Revenue Distribution</h2>
            </div>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartRows} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="generalLeadsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e293b" stopOpacity={1} />
                      <stop offset="100%" stopColor="#0f172a" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="generalRevGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbb217" stopOpacity={1} />
                      <stop offset="100%" stopColor="#d9930c" stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', borderRadius: '8px', border: 'none', color: 'white' }}
                    labelStyle={{ fontWeight: 'bold', color: '#fbb217' }}
                    formatter={(value, name) => 
                      name === 'Revenue' ? [money(Number(value)), 'Won Revenue'] : [compact(Number(value)), 'CRM Leads']
                    }
                  />
                  <Legend iconType="circle" />
                  <Bar yAxisId="left" dataKey="leads" name="CRM Leads" fill="url(#generalLeadsGradient)" radius={[4, 4, 0, 0]} barSize={28} />
                  <Bar yAxisId="right" dataKey="revenue" name="Revenue" fill="url(#generalRevGradient)" radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {renderTableSection()}
      </>
    );
  }

  function renderTableSection() {
    return (
      <section className="table-section">
        <div className="table-header">
          <div>
            <p className="eyebrow">Performance Table</p>
            <h2>{activeTab === 'blended' ? 'Client and Source Breakdown' : `${sourceLabel(activeTab)} breakdown`}</h2>
            <p className="section-note">
              Spend-driven metrics appear only where platform spend exists in the dataset.
            </p>
          </div>
          <div className="table-controls">
            {clientOptions.length > 1 && (
              <div className="table-filter-control">
                <Building2 size={15} />
                <select value={tableClient} onChange={(event) => setTableClient(event.target.value)}>
                  <option value="all">All clients</option>
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="sort-control">
              <ArrowDownUp size={15} />
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="leads">Sort by leads</option>
                <option value="won_revenue">Sort by revenue</option>
                {activeTab === 'meta_ads' || activeTab === 'blended' ? (
                  <>
                    <option value="spend">Sort by spend</option>
                    <option value="roas">Sort by ROAS</option>
                  </>
                ) : null}
              </select>
            </div>
          </div>
        </div>
        
        <div className="table-wrap">
          <table>
            <thead>
              {renderTableHeader()}
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="table-loading-text">Loading performance...</td></tr>
              ) : tableRows.length === 0 ? (
                <tr><td colSpan={12} className="table-empty-text">No data for this range.</td></tr>
              ) : (
                tableRows.map((row) => renderTableRow(row))
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderTableHeader() {
    const clientHeader = showClientColumn ? <th>Client</th> : null;
    if (activeTab === 'blended') {
      return (
        <tr>
          {clientHeader}
          <th>Source</th>
          <th>Leads</th>
          <th>Won Revenue</th>
          <th>Platform Spend</th>
          <th>ROAS</th>
          <th>Revenue / Lead</th>
        </tr>
      );
    } else if (activeTab === 'meta_ads') {
      return (
        <tr>
          {clientHeader}
          <th>CRM Leads</th>
          <th>Won Revenue</th>
          <th>Meta Spend</th>
          <th>ROAS</th>
          <th>Clicks</th>
          <th>Impressions</th>
          <th>CTR</th>
          <th>CPC</th>
          <th>CPL (Meta)</th>
          <th>Purchases</th>
          <th>CPA</th>
        </tr>
      );
    } else {
      // General channels
      return (
        <tr>
          {clientHeader}
          <th>CRM Leads</th>
          <th>Won Revenue</th>
          <th>Revenue / Lead</th>
        </tr>
      );
    }
  }

  function renderTableRow(row: SourcePerformanceRow) {
    const key = `${row.client_id}-${row.source_key}`;
    const rowRevenuePerLead = row.leads > 0 ? row.won_revenue / row.leads : null;
    const clientCell = showClientColumn ? <td>{row.client_name}</td> : null;
    
    if (activeTab === 'blended') {
      return (
        <tr key={key}>
          {clientCell}
          <td><span className={`source-pill ${row.source_key}`}>{displaySource(row)}</span></td>
          <td>{compact(row.leads)}</td>
          <td>{money(row.won_revenue)}</td>
          <td>
            {row.spend > 0 ? money(row.spend) : (
              <span className="muted-value">No spend data</span>
            )}
          </td>
          <td>{roas(row.roas)}</td>
          <td>{rowRevenuePerLead ? money(rowRevenuePerLead) : 'N/A'}</td>
        </tr>
      );
    } else if (activeTab === 'meta_ads') {
      const ctc = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
      const cpc = row.clicks > 0 ? row.spend / row.clicks : null;
      const cpl = row.meta_reported_leads > 0 ? row.spend / row.meta_reported_leads : null;
      const cpa = row.purchases > 0 ? row.spend / row.purchases : null;
      
      return (
        <tr key={key}>
          {clientCell}
          <td>{compact(row.leads)}</td>
          <td>{money(row.won_revenue)}</td>
          <td>{money(row.spend)}</td>
          <td>{roas(row.roas)}</td>
          <td>{compact(row.clicks)}</td>
          <td>{compact(row.impressions)}</td>
          <td>{ctc > 0 ? `${ctc.toFixed(2)}%` : '0%'}</td>
          <td>{moneyWithCents(cpc)}</td>
          <td>{moneyWithCents(cpl)}</td>
          <td>{compact(row.purchases)}</td>
          <td>{moneyWithCents(cpa)}</td>
        </tr>
      );
    } else {
      // General channels
      return (
        <tr key={key}>
          {clientCell}
          <td>{compact(row.leads)}</td>
          <td>{money(row.won_revenue)}</td>
          <td>{rowRevenuePerLead ? money(rowRevenuePerLead) : 'N/A'}</td>
        </tr>
      );
    }
  }

  function renderLoader() {
    return (
      <div className="paint-loader-overlay">
        <div className="paint-loader-container">
          <div className="paint-roller-wrapper">
            <div className="paint-trail"></div>
            <div className="paint-roller">
              <div className="roller-cylinder"></div>
              <div className="roller-handle-wire"></div>
              <div className="roller-handle-grip"></div>
            </div>
          </div>
          <div className="paint-loader-text">
            <h3>Rolling out ads performance...</h3>
            <p>Fetching leads and marketing spend</p>
          </div>
          <div className="floating-ads-particles">
            <span className="particle p-dollar">$</span>
            <span className="particle p-chart">📊</span>
            <span className="particle p-lead">👤</span>
            <span className="particle p-target">🎯</span>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Layout ---
  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo-icon.png" alt="Base Coat Marketing Logo" className="brand-logo-img" />
          <div className="brand-text">
            <h2>Base Coat</h2>
            <span>Attribution Suite</span>
          </div>
        </div>

        <div className="client-scope-box">
          <p className="scope-label">Logged as</p>
          <div className="scope-user" title={session.user.email}>
            <Users size={14} />
            <span>{session.user.email}</span>
          </div>
          <div className={`scope-badge ${isAgency ? 'agency' : 'client'}`}>
            {isAgency ? 'Agency Partner' : 'Client Access'}
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-title">Analysis</span>
          <button
            type="button"
            className={`nav-item ${activeTab === 'blended' ? 'active' : ''}`}
            onClick={() => setActiveTab('blended')}
          >
            <BarChart3 size={18} />
            <span>Overview (Blended)</span>
          </button>

          <span className="nav-section-title">Attribution Channels</span>
          
          <button
            type="button"
            className={`nav-item ${activeTab === 'meta_ads' ? 'active' : ''}`}
            onClick={() => setActiveTab('meta_ads')}
          >
            <span className="channel-dot meta"></span>
            <span>Meta Ads</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'google_ads' ? 'active' : ''}`}
            onClick={() => setActiveTab('google_ads')}
          >
            <span className="channel-dot google"></span>
            <span>Google Ads</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'glsa' ? 'active' : ''}`}
            onClick={() => setActiveTab('glsa')}
          >
            <span className="channel-dot glsa"></span>
            <span>GLSA</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'seo' ? 'active' : ''}`}
            onClick={() => setActiveTab('seo')}
          >
            <span className="channel-dot seo"></span>
            <span>SEO (Organic)</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'email' ? 'active' : ''}`}
            onClick={() => setActiveTab('email')}
          >
            <span className="channel-dot email"></span>
            <span>Email Marketing</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'unknown' ? 'active' : ''}`}
            onClick={() => setActiveTab('unknown')}
          >
            <span className="channel-dot direct"></span>
            <span>Direct / Unknown</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-button" onClick={signOut}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="content-header">
          <div className="header-info">
            <p className="eyebrow-small">Attribution Suite</p>
            <div className="title-row-flex">
              <h1>{activeTab === 'blended' ? 'Performance Overview' : `${sourceLabel(activeTab)} Performance`}</h1>
              {selectedClient !== 'all' && (
                <button className="reset-filter-btn" onClick={() => setSelectedClient('all')} type="button">
                  Clear Filter ✕
                </button>
              )}
            </div>
            <p className="header-subtitle">
              {scopeLabel} · {start} to {end}
            </p>
          </div>

          <div className="header-filters">
            {clientOptions.length > 1 && (
              <div className="filter-dropdown-wrap">
                <Building2 size={16} />
                <select value={selectedClient} onChange={(event) => setSelectedClient(event.target.value)}>
                  <option value="all">All clients</option>
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="filter-date-wrap">
              <CalendarDays size={16} />
              <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
              <span className="date-separator">to</span>
              <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
            </div>
            
            <div className="status-indicator-badge">
              <ShieldCheck size={14} />
              <span>Secure Connection</span>
            </div>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {/* Dynamic sub-dashboard rendering */}
        {activeTab === 'blended' && renderBlendedDashboard()}
        {activeTab === 'meta_ads' && renderMetaDashboard()}
        {activeTab !== 'blended' && activeTab !== 'meta_ads' && renderGeneralChannelDashboard()}
        
        {/* Loader Overlay */}
        {loading && renderLoader()}
      </main>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="metric-card">
      <div className="metric-sweep"></div>
      <div className="metric-icon-wrap">{icon}</div>
      <div className="metric-info">
        <p className="metric-label">{label}</p>
        <strong className="metric-value">{value}</strong>
      </div>
    </div>
  );
}

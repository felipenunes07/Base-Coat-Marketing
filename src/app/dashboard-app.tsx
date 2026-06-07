'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import {
  ArrowDownUp,
  BarChart3,
  Building2,
  CalendarDays,
  Compass,
  DollarSign,
  Globe,
  LogOut,
  Mail,
  Moon,
  MousePointerClick,
  ShieldCheck,
  Sun,
  Target,
  TrendingUp,
  Users
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
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

function MetaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M8.217 5.243C9.145 3.988 10.171 3 11.483 3 13.96 3 16 6.153 16.001 9.907c0 2.29-.986 3.725-2.757 3.725-1.543 0-2.395-.866-3.924-3.424l-.667-1.123-.118-.197a55 55 0 0 0-.53-.877l-1.178 2.08c-1.673 2.925-2.615 3.541-3.923 3.541C1.086 13.632 0 12.217 0 9.973 0 6.388 1.995 3 4.598 3q.477-.001.924.122c.31.086.611.22.913.407.577.359 1.154.915 1.782 1.714m1.516 2.224q-.378-.615-.727-1.133L9 6.326c.845-1.305 1.543-1.954 2.372-1.954 1.723 0 3.102 2.537 3.102 5.653 0 1.188-.39 1.877-1.195 1.877-.773 0-1.142-.51-2.61-2.87zM4.846 4.756c.725.1 1.385.634 2.34 2.001A212 212 0 0 0 5.551 9.3c-1.357 2.126-1.826 2.603-2.581 2.603-.777 0-1.24-.682-1.24-1.9 0-2.602 1.298-5.264 2.846-5.264q.137 0 .27.018" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.113-5.187 4.113-3.328 0-6.027-2.7-6.027-6.027s2.699-6.027 6.027-6.027c1.5 0 2.868.55 3.923 1.545l3.078-3.078C18.966 1.83 15.845 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.48 0 10.74-4.55 10.74-10.92 0-.72-.09-1.41-.24-2.275H12.24z" />
    </svg>
  );
}

type SortKey = 'leads' | 'won_revenue' | 'spend' | 'roas';

const defaultStart = process.env.NEXT_PUBLIC_DASHBOARD_DEFAULT_START ?? '2026-03-01';
const defaultEnd = process.env.NEXT_PUBLIC_DASHBOARD_DEFAULT_END ?? '2026-06-05';

function displaySource(row: Pick<SourcePerformanceRow, 'source' | 'source_key'>) {
  return sourceLabel(row.source_key, row.source);
}

function getInsightMeta(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('meta')) {
    return {
      type: 'meta',
      title: 'Meta Ads Insights',
      icon: <TrendingUp size={16} />
    };
  }
  if (lower.includes('google')) {
    return {
      type: 'google',
      title: 'Google Ads Insights',
      icon: <Target size={16} />
    };
  }
  if (lower.includes('organic') || lower.includes('seo') || lower.includes('email') || lower.includes('direct')) {
    return {
      type: 'organic',
      title: 'Organic Growth Insights',
      icon: <Globe size={16} />
    };
  }
  return {
    type: 'general',
    title: 'Executive Readout',
    icon: <BarChart3 size={16} />
  };
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
  
  // Custom navigation tab state
  const [activeTab, setActiveTab] = useState<string>('blended');
  const [overviewMetric, setOverviewMetric] = useState<'revenue' | 'leads'>('revenue');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

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



  const visibleRows = useMemo(() => {
    if (selectedClient === 'all') return rows;
    return rows.filter((row) => row.client_id === selectedClient);
  }, [rows, selectedClient]);

  // Dynamic client-grouped rows for the current tab (used when selectedClient === 'all')
  const tabClientGroupedRows = useMemo(() => {
    const clientsMap = new Map<string, {
      client_id: string;
      client_name: string;
      leads: number;
      won_revenue: number;
      spend: number;
      meta_reported_leads: number;
      clicks: number;
      impressions: number;
      purchases: number;
      top_channel_name: string;
      top_channel_val: number;
    }>();

    const clientChannels = new Map<string, Map<string, number>>(); // clientId -> channel -> revenue

    const filteredRows = activeTab === 'blended'
      ? rows
      : rows.filter((row) => row.source_key === activeTab);

    for (const row of filteredRows) {
      const current = clientsMap.get(row.client_id) ?? {
        client_id: row.client_id,
        client_name: row.client_name,
        leads: 0,
        won_revenue: 0,
        spend: 0,
        meta_reported_leads: 0,
        clicks: 0,
        impressions: 0,
        purchases: 0,
        top_channel_name: 'None',
        top_channel_val: -1
      };

      current.leads += row.leads;
      current.won_revenue += row.won_revenue;
      current.spend += row.spend;
      current.meta_reported_leads += row.meta_reported_leads;
      current.clicks += row.clicks;
      current.impressions += row.impressions || 0;
      current.purchases += row.purchases;
      clientsMap.set(row.client_id, current);

      // Track channel revenue
      let chanMap = clientChannels.get(row.client_id);
      if (!chanMap) {
        chanMap = new Map<string, number>();
        clientChannels.set(row.client_id, chanMap);
      }
      chanMap.set(row.source, (chanMap.get(row.source) ?? 0) + row.won_revenue);
    }

    // Assign top channel
    for (const [clientId, chanMap] of clientChannels.entries()) {
      const client = clientsMap.get(clientId);
      if (client) {
        let topChan = 'None';
        let maxVal = -1;
        for (const [chan, rev] of chanMap.entries()) {
          if (rev > maxVal) {
            maxVal = rev;
            topChan = chan;
          }
        }
        client.top_channel_name = topChan;
        client.top_channel_val = maxVal;
      }
    }

    return Array.from(clientsMap.values());
  }, [rows, activeTab]);

  // Sorted client-grouped rows for the table
  const sortedTabClientGroupedRows = useMemo(() => {
    return [...tabClientGroupedRows].sort((a, b) => {
      const left = sortKey === 'roas' ? (a.spend > 0 ? a.won_revenue / a.spend : -1) : a[sortKey as keyof typeof a] as number;
      const right = sortKey === 'roas' ? (b.spend > 0 ? b.won_revenue / b.spend : -1) : b[sortKey as keyof typeof b] as number;
      return (right as number) - (left as number);
    });
  }, [tabClientGroupedRows, sortKey]);

  // Dynamic channel-grouped rows for the selected client (used when activeTab === 'blended' && selectedClient !== 'all')
  const tabChannelGroupedRows = useMemo(() => {
    const channelsMap = new Map<string, {
      source_key: string;
      source: string;
      leads: number;
      won_revenue: number;
      spend: number;
      meta_reported_leads: number;
      clicks: number;
      impressions: number;
      purchases: number;
    }>();

    for (const row of visibleRows) {
      const current = channelsMap.get(row.source_key) ?? {
        source_key: row.source_key,
        source: row.source,
        leads: 0,
        won_revenue: 0,
        spend: 0,
        meta_reported_leads: 0,
        clicks: 0,
        impressions: 0,
        purchases: 0
      };

      current.leads += row.leads;
      current.won_revenue += row.won_revenue;
      current.spend += row.spend;
      current.meta_reported_leads += row.meta_reported_leads;
      current.clicks += row.clicks;
      current.impressions += row.impressions || 0;
      current.purchases += row.purchases;
      channelsMap.set(row.source_key, current);
    }

    return Array.from(channelsMap.values());
  }, [visibleRows]);

  // Sorted channel-grouped rows for the table
  const sortedTabChannelGroupedRows = useMemo(() => {
    return [...tabChannelGroupedRows].sort((a, b) => {
      const left = sortKey === 'roas' ? (a.spend > 0 ? a.won_revenue / a.spend : -1) : a[sortKey as keyof typeof a] as number;
      const right = sortKey === 'roas' ? (b.spend > 0 ? b.won_revenue / b.spend : -1) : b[sortKey as keyof typeof b] as number;
      return (right as number) - (left as number);
    });
  }, [tabChannelGroupedRows, sortKey]);

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

  // Derive role checking email first to prevent layout flashing, falling back to loaded client counts
  const isAgency = useMemo(() => {
    if (session?.user?.email === 'agency@skilltest.dev') return true;
    return clientOptions.length > 1;
  }, [session, clientOptions]);

  const scopeLabel =
    selectedClient === 'all'
      ? isAgency
        ? 'All clients'
        : clientOptions[0]?.name ?? 'Client account'
      : clientOptions.find((client) => client.id === selectedClient)?.name ?? 'Selected client';



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

  // Tab Selection Handler (Resets Sort state to Leads when heading to unpaid channels)
  const selectTab = (tab: string) => {
    setActiveTab(tab);
    if (tab !== 'blended' && tab !== 'meta_ads') {
      if (sortKey === 'spend' || sortKey === 'roas') {
        setSortKey('leads');
      }
    }
  };

  // Automated performance readout insights
  const executiveInsights = useMemo(() => {
    const channelRevenues = chartRows.map(r => ({ name: r.name, revenue: r.revenue, leads: r.leads }));
    const topChannel = channelRevenues.length > 0 
      ? channelRevenues.reduce((max, r) => r.revenue > max.revenue ? r : max, { name: '', revenue: -1, leads: 0 })
      : null;
      
    const organicRevenue = visibleRows
      .filter(r => r.source_key === 'seo' || r.source_key === 'email' || r.source_key === 'unknown')
      .reduce((sum, r) => sum + r.won_revenue, 0);
      
    const googleRow = visibleRows.find(r => r.source_key === 'google_ads');
    const googleRevPerLead = googleRow && googleRow.leads > 0 ? googleRow.won_revenue / googleRow.leads : 0;

    const insights = [];
    if (topChannel && topChannel.revenue > 0) {
      const pct = channelTotals.revenue > 0 ? (topChannel.revenue / channelTotals.revenue) * 100 : 0;
      insights.push(
        `**${topChannel.name}** is your primary revenue engine, contributing **${money(topChannel.revenue)}** (${pct.toFixed(0)}% of total blended revenue) from **${topChannel.leads}** attributed CRM leads.`
      );
    }
    
    if (organicRevenue > 0) {
      insights.push(
        `Organic channels (SEO, Email, and Direct traffic) generated a combined **${money(organicRevenue)}** in won revenue with **zero platform ad spend**.`
      );
    }
    
    if (googleRow && googleRow.leads > 0) {
      insights.push(
        `**Google Ads** generated **${googleRow.leads}** CRM leads with an average value of **${money(googleRevPerLead)}** per lead, demonstrating steady customer intent.`
      );
    } else {
      insights.push(
        `No leads were captured from paid Google search during this period. Consider verifying Google tracking tags.`
      );
    }
    
    return insights;
  }, [visibleRows, chartRows, channelTotals]);

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
          <Metric label="CRM Leads" value={compact(channelTotals.leads)} icon={<Users size={16} />} className="metric-leads" />
          <Metric label="Won Revenue" value={money(channelTotals.revenue)} icon={<DollarSign size={16} />} className="metric-revenue" />
          <Metric label="Total Spend" value={money(channelTotals.spend)} icon={<BarChart3 size={16} />} className="metric-spend" />
          <Metric label="Blended ROAS" value={roas(channelBlendedRoas)} icon={<TrendingUp size={16} />} className="metric-roas" />
          <Metric label="Revenue / Lead" value={channelRevenuePerLead ? money(channelRevenuePerLead) : 'N/A'} icon={<Target size={16} />} className="metric-rev-lead" />
          <Metric label="Blended CPL" value={channelCpl ? moneyWithCents(channelCpl) : 'N/A'} icon={<DollarSign size={16} />} className="metric-cpl" />
        </section>

        {/* Channel Performance — Chart + Breakdown Cards (unified) */}
        <section className="channel-overview-card">
          <div className="card-header-flex">
            <div className="section-heading">
              <p className="eyebrow">Attribution Overview</p>
              <h2>Channel Performance</h2>
            </div>
            
            <div className="metric-toggle-group">
              <button 
                type="button"
                className={`toggle-btn ${overviewMetric === 'revenue' ? 'active' : ''}`}
                onClick={() => setOverviewMetric('revenue')}
              >
                <DollarSign size={14} />
                <span>Won Revenue</span>
              </button>
              <button 
                type="button"
                className={`toggle-btn ${overviewMetric === 'leads' ? 'active' : ''}`}
                onClick={() => setOverviewMetric('leads')}
              >
                <Users size={14} />
                <span>CRM Leads</span>
              </button>
            </div>
          </div>

          <div className="channel-overview-layout">
            {/* Esquerda: O Gráfico */}
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartRows} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="meta_adsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme === 'dark' ? "#60a5fa" : "#4f7db3"} stopOpacity={1} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#2563eb" : "#2c507a"} stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="google_adsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme === 'dark' ? "#fbb217" : "#e5b858"} stopOpacity={1} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#d9930c" : "#b58928"} stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="glsaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme === 'dark' ? "#a3e635" : "#8cb954"} stopOpacity={1} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#65a30d" : "#5c862a"} stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="seoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme === 'dark' ? "#c084fc" : "#a58dbf"} stopOpacity={1} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#7c3aed" : "#745a90"} stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="emailGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme === 'dark' ? "#2dd4bf" : "#63ada5"} stopOpacity={1} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#0f766e" : "#34766f"} stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="unknownGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme === 'dark' ? "#94a3b8" : "#9ba8b8"} stopOpacity={1} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#475569" : "#627285"} stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)'} />
                  <XAxis 
                    dataKey="name" 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} 
                  />
                  <YAxis 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                    tickFormatter={
                      overviewMetric === 'revenue' 
                        ? (v) => `$${(v / 1000).toFixed(0)}k` 
                        : (v) => compact(v)
                    }
                  />
                  <Tooltip
                    cursor={{ fill: theme === 'dark' ? 'rgba(241, 245, 249, 0.05)' : 'rgba(15, 23, 42, 0.03)', radius: 4 }}
                    contentStyle={theme === 'dark' ? { 
                      background: '#16161a', 
                      borderRadius: '12px', 
                      border: 'none', 
                      color: 'white',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                      padding: '10px 14px'
                    } : {
                      background: '#ffffff', 
                      borderRadius: '12px', 
                      border: '1px solid #e2e8f0', 
                      color: '#0f172a',
                      boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.05)',
                      padding: '10px 14px'
                    }}
                    labelStyle={{ fontWeight: 'bold', color: theme === 'dark' ? '#cbd5e1' : '#64748b', marginBottom: '4px' }}
                    formatter={(value) => [
                      overviewMetric === 'revenue' ? money(Number(value)) : compact(Number(value)),
                      overviewMetric === 'revenue' ? 'Won Revenue' : 'CRM Leads'
                    ]}
                  />
                  <Bar 
                    dataKey={overviewMetric} 
                    radius={[8, 8, 0, 0]} 
                    barSize={48}
                  >
                    {chartRows.map((entry, index) => {
                      const key = entry.name.toLowerCase().replace(' ', '_');
                      const gradName = key === 'meta_ads' || key === 'meta' 
                        ? 'meta_adsGrad' 
                        : key === 'google_ads' || key === 'google' 
                          ? 'google_adsGrad' 
                          : `${key}Grad`;
                      return <Cell key={`cell-${index}`} fill={`url(#${gradName})`} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="pane-divider"></div>

            {/* Direita: O Grid de Cards compactos */}
            <div className="channel-overview-cards-pane">
              {chartRows.map((row) => {
                const key = row.name.toLowerCase().replace(' ', '_');
                const leadsPct = channelTotals.leads > 0 ? (row.leads / channelTotals.leads) * 100 : 0;
                const revPct = channelTotals.revenue > 0 ? (row.revenue / channelTotals.revenue) * 100 : 0;
                const channelRoas = row.spend > 0 ? row.revenue / row.spend : null;
                const channelCplVal = row.leads > 0 && row.spend > 0 ? row.spend / row.leads : null;
                
                const isRevenueMetric = overviewMetric === 'revenue';
                const mainPct = isRevenueMetric ? revPct : leadsPct;
                const mainVal = isRevenueMetric ? money(row.revenue) : `${row.leads} leads`;

                const isPaidChannel = key === 'meta_ads' || key === 'meta' || key === 'google_ads' || key === 'google' || key === 'glsa';
                
                // Channel icon mapping
                let channelIcon = <Compass className="channel-card-icon direct" size={15} />;
                if (key === 'meta_ads' || key === 'meta') {
                  channelIcon = <MetaIcon className="channel-card-icon meta" />;
                } else if (key === 'google_ads' || key === 'google') {
                  channelIcon = <GoogleIcon className="channel-card-icon google" />;
                } else if (key === 'glsa') {
                  channelIcon = <ShieldCheck className="channel-card-icon glsa" size={15} />;
                } else if (key === 'seo') {
                  channelIcon = <Globe className="channel-card-icon seo" size={15} />;
                } else if (key === 'email') {
                  channelIcon = <Mail className="channel-card-icon email" size={15} />;
                }

                const spendVal = row.spend > 0 ? money(row.spend) : '$0';
                const roasVal = channelRoas ? `${channelRoas.toFixed(2)}x` : '—';
                const cplText = channelCplVal ? moneyWithCents(channelCplVal) : '—';

                return (
                  <div key={row.name} className={`premium-channel-card ${key}`}>
                    <div className="card-content-wrapper">
                      <div className="card-channel-header">
                        <div className="header-left">
                          {channelIcon}
                          <span className="card-channel-name">{row.name}</span>
                        </div>
                        <span className="card-channel-share">{mainPct.toFixed(0)}% share</span>
                      </div>
                      
                      <div className="card-primary-value">
                        <strong className="value-large">{mainVal}</strong>
                      </div>
                      
                      {/* Mini progress bar */}
                      <div className="mini-progress-track">
                        <div className={`mini-progress-fill ${key}`} style={{ width: `${mainPct}%` }}></div>
                      </div>

                      <div className="card-metrics-grid">
                        <div className="metric-grid-item">
                          <span className="item-label">Revenue</span>
                          <span className="item-value">{money(row.revenue)}</span>
                        </div>
                        <div className="metric-grid-item">
                          <span className="item-label">Leads</span>
                          <span className="item-value">{row.leads}</span>
                        </div>
                        <div className="metric-grid-item">
                          <span className="item-label">Spend</span>
                          <span className="item-value">{spendVal}</span>
                        </div>
                        <div className="metric-grid-item">
                          <span className="item-label">ROAS</span>
                          <span className={`item-value ${channelRoas ? 'roas-active' : ''}`}>{roasVal}</span>
                        </div>
                      </div>

                      <div className="card-channel-footer-new">
                        {isPaidChannel ? (
                          row.spend > 0 ? (
                            <div className="footer-cpl-info">
                              <span className="cpl-label">CPL:</span>
                              <span className="cpl-value">{cplText}</span>
                            </div>
                          ) : (
                            <span className="inactive-tag">Paid (No Spend)</span>
                          )
                        ) : (
                          <span className="organic-pill-tag">Organic</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Executive Insights */}
        <section className="insight-section">
          <div className="section-heading">
            <p className="eyebrow-small">Executive Insights</p>
            <h2>Performance Readout</h2>
          </div>
          <div className="insights-container">
            <ul className="insights-list">
              {executiveInsights.map((insight, idx) => {
                const parts = insight.split('**');
                return (
                  <li key={idx} className="insight-item">
                    <span className="insight-bullet">•</span>
                    <p className="insight-text">
                      {parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}
                    </p>
                  </li>
                );
              })}
            </ul>
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
          <div className="banner-logo">
            <BarChart3 size={22} style={{ color: '#0866ff' }} />
          </div>
          <div className="banner-text">
            <h3>Meta Ads Performance Workspace</h3>
            <p>Direct API metrics compared with CRM lead tracking and closed-won opportunity attribution.</p>
          </div>
        </div>

        {/* KPI Subgrids grouped logically */}
        <div className="meta-kpi-groups">
          <div className="kpi-group-card">
            <h4>
              <DollarSign size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
              Financial Performance
            </h4>
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
            <h4>
              <BarChart3 size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
              Funnel & Ad Delivery
            </h4>
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
            <h4>
              <Target size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
              Conversions & Attribution
            </h4>
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
              <h2>Top Clients by Revenue (Meta Ads Only)</h2>
            </div>
            <div className="client-grid">
              {channelClientSummaries.slice(0, 4).map((client) => {
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
            <p className="client-comparison-note">
              Showing top 4 performing clients. See the performance table below for all accounts.
            </p>
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
                      <stop offset="0%" stopColor={theme === 'dark' ? "#60a5fa" : "#4f7db3"} stopOpacity={1} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#2563eb" : "#2c507a"} stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="metaLeadsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme === 'dark' ? "#fbb217" : "#e5b858"} stopOpacity={1} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#d9930c" : "#b58928"} stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)'} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.03)', radius: 4 }}
                    contentStyle={theme === 'dark' ? { background: '#16161a', borderRadius: '8px', border: 'none', color: 'white' } : { background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#0f172a' }}
                    labelStyle={{ fontWeight: 'bold', color: theme === 'dark' ? '#60a5fa' : '#5c7fa8' }}
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
            icon: <Target size={22} style={{ color: '#fbb217' }} />,
            accent: 'google'
          };
        case 'glsa':
          return {
            title: 'Google Local Services Ads (GLSA)',
            desc: 'Pay-per-lead phone calls and bookings verified by Google. Focuses on hyper-local client requests and direct call attribution.',
            icon: <Building2 size={22} style={{ color: '#84cc16' }} />,
            accent: 'glsa'
          };
        case 'seo':
          return {
            title: 'Search Engine Optimization (Organic SEO)',
            desc: 'Non-paid organic search query acquisitions. All leads and opportunities are driven naturally, carrying zero advertising costs and yielding optimal profit margins.',
            icon: <TrendingUp size={22} style={{ color: '#a855f7' }} />,
            accent: 'seo'
          };
        case 'email':
          return {
            title: 'Email Outreach & Newsletters',
            desc: 'Attributed leads originating from outbound prospect lists, newsletter campaigns, and customer retention flows.',
            icon: <MousePointerClick size={22} style={{ color: '#0d9488' }} />,
            accent: 'email'
          };
        default:
          return {
            title: 'Direct / Unattributed traffic',
            desc: 'Direct website entries, general word-of-mouth referrers, or client walk-ins lacking campaign tracking parameters.',
            icon: <Users size={22} style={{ color: '#64748b' }} />,
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
          <Metric label="CRM Tracked Leads" value={compact(channelTotals.leads)} icon={<Users size={16} />} className="metric-leads" />
          <Metric label="Won Revenue" value={money(channelTotals.revenue)} icon={<DollarSign size={16} />} className="metric-revenue" />
          <Metric label="Revenue / Lead" value={channelRevenuePerLead ? money(channelRevenuePerLead) : 'N/A'} icon={<Target size={16} />} className="metric-rev-lead" />
        </section>

        {/* Client Comparison for Agency */}
        {isAgency && selectedClient === 'all' && (
          <section className="client-comparison">
            <div className="section-heading">
              <p className="eyebrow">Agency Overview</p>
              <h2>Top Clients by Revenue</h2>
            </div>
            <div className="client-grid">
              {channelClientSummaries.slice(0, 4).map((client) => {
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
            <p className="client-comparison-note">
              Showing top 4 performing clients. See the performance table below for all accounts.
            </p>
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
                      <stop offset="0%" stopColor="#64748b" stopOpacity={1} />
                      <stop offset="100%" stopColor="#334155" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="generalRevGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme === 'dark' ? "#fbb217" : "#e5b858"} stopOpacity={1} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#d9930c" : "#b58928"} stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)'} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.03)', radius: 4 }}
                    contentStyle={theme === 'dark' ? { background: '#16161a', borderRadius: '8px', border: 'none', color: 'white' } : { background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#0f172a' }}
                    labelStyle={{ fontWeight: 'bold', color: theme === 'dark' ? '#fbb217' : '#cfad63' }}
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
    // If not the blended tab, and we have scoped to a single client, don't show the redundant table.
    if (activeTab !== 'blended' && selectedClient !== 'all') {
      return null;
    }

    const displayRows = activeTab === 'blended'
      ? (selectedClient === 'all' ? sortedTabClientGroupedRows : sortedTabChannelGroupedRows)
      : sortedTabClientGroupedRows;

    return (
      <section className="table-section">
        <div className="table-header">
          <div>
            <p className="eyebrow">Performance Table</p>
            <h2>
              {activeTab === 'blended'
                ? (selectedClient === 'all' ? 'Client Performance Breakdown' : 'Channel Performance Breakdown')
                : `${sourceLabel(activeTab)} Breakdown by Client`
              }
            </h2>
            <p className="section-note">
              {activeTab === 'blended' && selectedClient === 'all'
                ? 'Click on any client row to drill down into their specific account performance.'
                : 'Spend-driven metrics appear only where platform spend exists.'
              }
            </p>
          </div>
          <div className="table-controls">
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
              ) : displayRows.length === 0 ? (
                <tr><td colSpan={12} className="table-empty-text">No data for this range.</td></tr>
              ) : (
                displayRows.map((row) => renderTableRow(row))
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderTableHeader() {
    if (activeTab === 'blended') {
      if (selectedClient === 'all') {
        return (
          <tr>
            <th style={{ textAlign: 'left' }}>Client</th>
            <th>Leads</th>
            <th>Won Revenue</th>
            <th>Platform Spend</th>
            <th>Blended ROAS</th>
            <th>Revenue / Lead</th>
            <th>Blended CPL</th>
            <th style={{ textAlign: 'left' }}>Top Channel</th>
          </tr>
        );
      } else {
        return (
          <tr>
            <th style={{ textAlign: 'left' }}>Channel</th>
            <th>Leads</th>
            <th>Won Revenue</th>
            <th>Platform Spend</th>
            <th>ROAS</th>
            <th>Revenue / Lead</th>
            <th>CPL</th>
          </tr>
        );
      }
    } else if (activeTab === 'meta_ads') {
      return (
        <tr>
          <th style={{ textAlign: 'left' }}>Client</th>
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
      // General channels (Google Ads, GLSA, SEO, Email, Direct)
      return (
        <tr>
          <th style={{ textAlign: 'left' }}>Client</th>
          <th>CRM Leads</th>
          <th>Won Revenue</th>
          <th>Revenue / Lead</th>
        </tr>
      );
    }
  }

  function renderTableRow(row: any) {
    if (activeTab === 'blended') {
      if (selectedClient === 'all') {
        const clientRoas = row.spend > 0 ? row.won_revenue / row.spend : null;
        const revPerLead = row.leads > 0 ? row.won_revenue / row.leads : null;
        const cpl = row.leads > 0 ? row.spend / row.leads : null;
        
        return (
          <tr 
            key={row.client_id} 
            onClick={() => setSelectedClient(row.client_id)}
            style={{ cursor: 'pointer' }}
            title="Click to view scoped client dashboard"
          >
            <td style={{ textAlign: 'left', fontWeight: 700, color: 'var(--brand-gold)' }}>
              {row.client_name}
            </td>
            <td>{compact(row.leads)}</td>
            <td>{money(row.won_revenue)}</td>
            <td>{row.spend > 0 ? money(row.spend) : <span className="muted-value">No spend</span>}</td>
            <td>{roas(clientRoas)}</td>
            <td>{revPerLead ? money(revPerLead) : 'N/A'}</td>
            <td>{cpl ? moneyWithCents(cpl) : 'N/A'}</td>
            <td style={{ textAlign: 'left' }}>
              <span className={`source-pill ${row.top_channel_name.toLowerCase().replace(' ', '_')}`}>
                {row.top_channel_name}
              </span>
            </td>
          </tr>
        );
      } else {
        const channelRoas = row.spend > 0 ? row.won_revenue / row.spend : null;
        const revPerLead = row.leads > 0 ? row.won_revenue / row.leads : null;
        const cpl = row.leads > 0 ? row.spend / row.leads : null;
        
        return (
          <tr key={row.source_key}>
            <td style={{ textAlign: 'left' }}>
              <span className={`source-pill ${row.source_key}`}>
                {row.source}
              </span>
            </td>
            <td>{compact(row.leads)}</td>
            <td>{money(row.won_revenue)}</td>
            <td>{row.spend > 0 ? money(row.spend) : <span className="muted-value">No spend</span>}</td>
            <td>{roas(channelRoas)}</td>
            <td>{revPerLead ? money(revPerLead) : 'N/A'}</td>
            <td>{cpl ? moneyWithCents(cpl) : 'N/A'}</td>
          </tr>
        );
      }
    } else if (activeTab === 'meta_ads') {
      const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
      const cpc = row.clicks > 0 ? row.spend / row.clicks : null;
      const cpl = row.meta_reported_leads > 0 ? row.spend / row.meta_reported_leads : null;
      const cpa = row.purchases > 0 ? row.spend / row.purchases : null;
      
      return (
        <tr key={row.client_id}>
          <td style={{ textAlign: 'left', fontWeight: 700, color: 'var(--brand-gold)' }}>{row.client_name}</td>
          <td>{compact(row.leads)}</td>
          <td>{money(row.won_revenue)}</td>
          <td>{money(row.spend)}</td>
          <td>{roas(row.roas)}</td>
          <td>{compact(row.clicks)}</td>
          <td>{compact(row.impressions)}</td>
          <td>{ctr > 0 ? `${ctr.toFixed(2)}%` : '0%'}</td>
          <td>{moneyWithCents(cpc)}</td>
          <td>{moneyWithCents(cpl)}</td>
          <td>{compact(row.purchases)}</td>
          <td>{moneyWithCents(cpa)}</td>
        </tr>
      );
    } else {
      const revPerLead = row.leads > 0 ? row.won_revenue / row.leads : null;
      return (
        <tr key={row.client_id}>
          <td style={{ textAlign: 'left', fontWeight: 700, color: 'var(--brand-gold)' }}>{row.client_name}</td>
          <td>{compact(row.leads)}</td>
          <td>{money(row.won_revenue)}</td>
          <td>{revPerLead ? money(revPerLead) : 'N/A'}</td>
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
          {rows.length > 0 ? (
            <div className={`scope-badge ${isAgency ? 'agency' : 'client'}`}>
              {isAgency ? 'Agency Partner' : 'Client Access'}
            </div>
          ) : (
            <div className="scope-badge loading">
              Detecting scope...
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-title">Analysis</span>
          <button
            type="button"
            className={`nav-item ${activeTab === 'blended' ? 'active' : ''}`}
            onClick={() => selectTab('blended')}
          >
            <BarChart3 size={16} />
            <span>Overview (Blended)</span>
          </button>

          <span className="nav-section-title">Attribution Channels</span>
          
          <button
            type="button"
            className={`nav-item ${activeTab === 'meta_ads' ? 'active' : ''}`}
            onClick={() => selectTab('meta_ads')}
          >
            <MetaIcon className="channel-icon meta" />
            <span>Meta Ads</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'google_ads' ? 'active' : ''}`}
            onClick={() => selectTab('google_ads')}
          >
            <GoogleIcon className="channel-icon google" />
            <span>Google Ads</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'glsa' ? 'active' : ''}`}
            onClick={() => selectTab('glsa')}
          >
            <ShieldCheck size={16} className="channel-icon glsa" />
            <span>GLSA</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'seo' ? 'active' : ''}`}
            onClick={() => selectTab('seo')}
          >
            <Globe size={16} className="channel-icon seo" />
            <span>SEO (Organic)</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'email' ? 'active' : ''}`}
            onClick={() => selectTab('email')}
          >
            <Mail size={16} className="channel-icon email" />
            <span>Email Marketing</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'unknown' ? 'active' : ''}`}
            onClick={() => selectTab('unknown')}
          >
            <Compass size={16} className="channel-icon direct" />
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

      <main className={`main-content ${theme}-theme`}>
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
            
            <button 
              type="button" 
              className="theme-toggle-switch"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>

            <div className="status-indicator-badge">
              <ShieldCheck size={14} />
              <span>Secure</span>
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

function Metric({
  label,
  value,
  icon,
  className
}: {
  label: string;
  value: string;
  icon: ReactNode;
  className?: string;
}) {
  return (
    <div className={`metric-card ${className || ''}`}>
      <div className="metric-sweep"></div>
      <div className="metric-card-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon-wrap">{icon}</div>
      </div>
      <div className="metric-card-body">
        <strong className="metric-value">{value}</strong>
      </div>
    </div>
  );
}

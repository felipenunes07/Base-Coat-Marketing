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
  YAxis
} from 'recharts';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import type { SourcePerformanceRow } from '@/lib/source-performance';
import { compact, money, roas } from '@/lib/format';

const supabase = createBrowserSupabaseClient();

type SortKey = 'leads' | 'won_revenue' | 'spend' | 'roas';

const defaultStart = '2026-03-01';
const defaultEnd = '2026-03-31';

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

  const sortedRows = useMemo(() => {
    return [...visibleRows].sort((a, b) => {
      if (a.client_name !== b.client_name) return a.client_name.localeCompare(b.client_name);
      const left = sortKey === 'roas' ? a.roas ?? -1 : a[sortKey];
      const right = sortKey === 'roas' ? b.roas ?? -1 : b[sortKey];
      return right - left;
    });
  }, [visibleRows, sortKey]);

  const totals = useMemo(
    () =>
      visibleRows.reduce(
        (acc, row) => {
          acc.leads += row.leads;
          acc.revenue += row.won_revenue;
          acc.spend += row.spend;
          acc.clicks += row.clicks;
          acc.metaLeads += row.meta_reported_leads;
          acc.purchases += row.purchases;
          acc.clients.add(row.client_name);
          return acc;
        },
        { leads: 0, revenue: 0, spend: 0, clicks: 0, metaLeads: 0, purchases: 0, clients: new Set<string>() }
      ),
    [visibleRows]
  );

  const blendedRoas = totals.spend > 0 ? totals.revenue / totals.spend : null;
  const costPerMetaLead = totals.metaLeads > 0 ? totals.spend / totals.metaLeads : null;
  const chartRows = useMemo(
    () => {
      const grouped = visibleRows.reduce((map, row) => {
          const current = map.get(row.source) ?? { source: row.source, leads: 0, revenue: 0, spend: 0 };
          current.leads += row.leads;
          current.revenue += row.won_revenue;
          current.spend += row.spend;
          map.set(row.source, current);
          return map;
        }, new Map<string, { source: string; leads: number; revenue: number; spend: number }>());
      return Array.from(grouped.values()).sort((a, b) => b.leads - a.leads);
    },
    [visibleRows]
  );

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-visual">
          <div className="login-brand">
            <div className="brand-mark">BC</div>
            <span>Base Coat Marketing</span>
          </div>
          <div className="login-preview">
            <p className="eyebrow">Client reporting console</p>
            <h1>Source performance, revenue, and Meta efficiency.</h1>
            <div className="preview-strip">
              <span><strong>ROAS</strong> by source</span>
              <span><strong>Won</strong> revenue</span>
              <span><strong>Tenant</strong> scoped</span>
            </div>
          </div>
        </section>
        <form className="login-panel" onSubmit={signIn}>
          <div>
            <p className="eyebrow">Secure access</p>
            <h2>Sign in to the dashboard</h2>
            <p className="form-copy">Use the provided agency or Northpaw client login.</p>
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
            <button type="button" onClick={() => setEmail('agency@skilltest.dev')}>Agency</button>
            <button type="button" onClick={() => setEmail('client-northpaw@skilltest.dev')}>Client</button>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="primary-button" disabled={authLoading}>
            {authLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-line">
            <span className="brand-dot">BC</span>
            <span>Base Coat Reporting</span>
          </div>
          <h1>Performance overview</h1>
        </div>
        <div className="top-actions">
          <div className="user-pill">
            <Users size={15} />
            {session.user.email}
          </div>
          <button className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="control-band">
        <div className="scope-field">
          <Building2 size={17} />
          <label>
            Client
            {clientOptions.length > 1 ? (
              <select value={selectedClient} onChange={(event) => setSelectedClient(event.target.value)}>
                <option value="all">All clients</option>
                {clientOptions.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            ) : (
              <span>{clientOptions[0]?.name ?? 'Loading'}</span>
            )}
          </label>
        </div>
        <div className="date-field">
          <CalendarDays size={17} />
          <label>
            Start
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
        </div>
        <div className="date-field">
          <CalendarDays size={17} />
          <label>
            End
            <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
        <div className="status-chip ok">
          <ShieldCheck size={16} />
          Scoped from signed-in user
        </div>
      </section>

      {error && <p className="error-banner">{error}</p>}

      <section className="kpi-grid">
        <Metric label="CRM leads" value={compact(totals.leads)} icon={<Users size={18} />} />
        <Metric label="Won revenue" value={money(totals.revenue)} icon={<DollarSign size={18} />} />
        <Metric label="Meta spend" value={money(totals.spend)} icon={<BarChart3 size={18} />} />
        <Metric label="Blended ROAS" value={roas(blendedRoas)} icon={<TrendingUp size={18} />} />
      </section>

      <section className="workspace">
        <div className="chart-panel">
          <div className="section-heading">
            <p className="eyebrow">By source</p>
            <h2>Lead volume and revenue contribution</h2>
          </div>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d8dedb" />
                <XAxis dataKey="source" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(value, name) =>
                    name === 'revenue' || name === 'spend' ? money(Number(value)) : compact(Number(value))
                  }
                />
                <Bar dataKey="leads" name="Leads" fill="#0866ff" radius={[5, 5, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue" fill="#18243a" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <aside className="meta-panel">
          <p className="eyebrow">Meta efficiency</p>
          <h2>{money(totals.spend)} invested</h2>
          <div className="meta-ring">
            <span>{roas(blendedRoas)}</span>
            <small>blended ROAS</small>
          </div>
          <div className="meta-list">
            <span><MousePointerClick size={15} /> {compact(totals.clicks)} clicks</span>
            <span><Target size={15} /> {compact(totals.metaLeads)} Meta-reported leads</span>
            <span><DollarSign size={15} /> {costPerMetaLead ? money(costPerMetaLead) : 'N/A'} cost per Meta lead</span>
          </div>
        </aside>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <p className="eyebrow">Performance table</p>
            <h2>Client and source breakdown</h2>
          </div>
          <div className="sort-control">
            <ArrowDownUp size={15} />
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="leads">Sort by leads</option>
              <option value="won_revenue">Sort by revenue</option>
              <option value="spend">Sort by spend</option>
              <option value="roas">Sort by ROAS</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Source</th>
                <th>Leads</th>
                <th>Won revenue</th>
                <th>Meta spend</th>
                <th>ROAS</th>
                <th>Clicks</th>
                <th>Meta leads</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>Loading performance...</td></tr>
              ) : sortedRows.length === 0 ? (
                <tr><td colSpan={8}>No data for this range.</td></tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={`${row.client_id}-${row.source_key}`}>
                    <td>{row.client_name}</td>
                    <td><span className={`source-pill ${row.source_key}`}>{row.source}</span></td>
                    <td>{compact(row.leads)}</td>
                    <td>{money(row.won_revenue)}</td>
                    <td>{row.spend > 0 ? money(row.spend) : 'N/A'}</td>
                    <td>{roas(row.roas)}</td>
                    <td>{compact(row.clicks)}</td>
                    <td>{compact(row.meta_reported_leads)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

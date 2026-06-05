'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  LockKeyhole,
  LogOut,
  ShieldCheck,
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
import type { PerformanceResponse, SourcePerformanceRow } from '@/lib/source-performance';
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
  const [dataPath, setDataPath] = useState<PerformanceResponse['dataPath'] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('leads');

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
    setDataPath(null);
    setWarning(null);
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
      setDataPath(payload.dataPath);
      setWarning(payload.warning ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.client_name !== b.client_name) return a.client_name.localeCompare(b.client_name);
      const left = sortKey === 'roas' ? a.roas ?? -1 : a[sortKey];
      const right = sortKey === 'roas' ? b.roas ?? -1 : b[sortKey];
      return right - left;
    });
  }, [rows, sortKey]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.leads += row.leads;
          acc.revenue += row.won_revenue;
          acc.spend += row.spend;
          acc.clicks += row.clicks;
          acc.clients.add(row.client_name);
          return acc;
        },
        { leads: 0, revenue: 0, spend: 0, clicks: 0, clients: new Set<string>() }
      ),
    [rows]
  );

  const blendedRoas = totals.spend > 0 ? totals.revenue / totals.spend : null;
  const chartRows = useMemo(
    () => {
      const grouped = rows.reduce((map, row) => {
          const current = map.get(row.source) ?? { source: row.source, leads: 0, revenue: 0, spend: 0 };
          current.leads += row.leads;
          current.revenue += row.won_revenue;
          current.spend += row.spend;
          map.set(row.source, current);
          return map;
        }, new Map<string, { source: string; leads: number; revenue: number; spend: number }>());
      return Array.from(grouped.values()).sort((a, b) => b.leads - a.leads);
    },
    [rows]
  );

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-visual">
          <div className="brand-mark">BC</div>
          <p className="eyebrow">Base Coat Marketing</p>
          <h1>Attribution that is clear enough to defend.</h1>
          <p className="login-copy">
            Leads, won revenue, Meta spend, and ROAS by source with client-safe access controls.
          </p>
          <div className="proof-row">
            <span><ShieldCheck size={16} /> Tenant scoped</span>
            <span><BarChart3 size={16} /> Source-level</span>
            <span><LockKeyhole size={16} /> Authenticated</span>
          </div>
        </section>
        <form className="login-panel" onSubmit={signIn}>
          <div>
            <p className="eyebrow">Dashboard login</p>
            <h2>Open performance workspace</h2>
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
            <span>Base Coat Marketing</span>
          </div>
          <h1>Source performance</h1>
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
        <div className={`status-chip ${dataPath === 'rpc' ? 'ok' : 'warn'}`}>
          {dataPath === 'rpc' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {dataPath === 'rpc' ? 'RPC active' : 'Server fallback'}
        </div>
      </section>

      {warning && <p className="notice">{warning}</p>}
      {error && <p className="error-banner">{error}</p>}

      <section className="kpi-grid">
        <Metric label="Leads" value={compact(totals.leads)} icon={<Users size={18} />} />
        <Metric label="Won revenue" value={money(totals.revenue)} icon={<DollarSign size={18} />} />
        <Metric label="Meta spend" value={money(totals.spend)} icon={<BarChart3 size={18} />} />
        <Metric label="Blended ROAS" value={roas(blendedRoas)} icon={<ShieldCheck size={18} />} />
      </section>

      <section className="workspace">
        <div className="chart-panel">
          <div className="section-heading">
            <p className="eyebrow">By source</p>
            <h2>Lead volume and won revenue</h2>
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
                <Bar dataKey="leads" name="Leads" fill="#264c3d" radius={[5, 5, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue" fill="#c4824a" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <aside className="audit-panel">
          <p className="eyebrow">Audit notes</p>
          <h2>Security finding</h2>
          <p>
            The planted bug is in `meta_ads_metrics`: Northpaw can directly read Cedarline rows until
            the RLS migration is applied.
          </p>
          <div className="audit-list">
            <span><LockKeyhole size={15} /> Backend derives tenant from the JWT user.</span>
            <span><ShieldCheck size={15} /> SQL migration scopes direct table reads.</span>
            <span><BarChart3 size={15} /> RPC is the intended dashboard data path.</span>
          </div>
        </aside>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <p className="eyebrow">Performance table</p>
            <h2>Find any number fast</h2>
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
                    <td><span className="source-pill">{row.source}</span></td>
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

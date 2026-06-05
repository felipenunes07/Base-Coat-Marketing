const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ansnstooqppdqiwrdqqi.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuc25zdG9vcXBwZHFpd3JkcXFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTI3MzksImV4cCI6MjA5NjE4ODczOX0.G9rGVG2g5PJxvbGT_ecjJgcTXzCtiB-I_QyUf34Wszk';

const NORTHPAW_CLIENT_ID = 'a0000000-0000-0000-0000-000000000001';
const CEDARLINE_CLIENT_ID = 'b0000000-0000-0000-0000-000000000002';
const DEFAULT_RANGE = { p_start: '2026-03-01', p_end: '2026-03-31' };

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
  }

  return { response, body };
}

async function login(email) {
  const { body } = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'Password123!' })
  });

  return body.access_token;
}

async function selectRows(token, table, query) {
  const { response, body } = await request(`/rest/v1/${table}?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'count=exact'
    }
  });

  return {
    rows: body,
    countHeader: response.headers.get('content-range')
  };
}

async function callSourcePerformance(token) {
  const { body } = await request('/rest/v1/rpc/get_source_performance', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(DEFAULT_RANGE)
  });

  return body;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const agencyToken = await login('agency@skilltest.dev');
  const northpawToken = await login('client-northpaw@skilltest.dev');

  const cedarAsNorthpaw = await selectRows(
    northpawToken,
    'meta_ads_metrics',
    `select=id,client_id&client_id=eq.${CEDARLINE_CLIENT_ID}`
  );
  assert(
    cedarAsNorthpaw.rows.length === 0,
    `Northpaw client can read ${cedarAsNorthpaw.rows.length} Cedarline meta_ads_metrics rows`
  );

  const northpawAsNorthpaw = await selectRows(
    northpawToken,
    'meta_ads_metrics',
    `select=id,client_id&client_id=eq.${NORTHPAW_CLIENT_ID}&limit=1`
  );
  assert(northpawAsNorthpaw.rows.length > 0, 'Northpaw client cannot read its own meta_ads_metrics rows');

  const cedarAsAgency = await selectRows(
    agencyToken,
    'meta_ads_metrics',
    `select=id,client_id&client_id=eq.${CEDARLINE_CLIENT_ID}&limit=1`
  );
  assert(cedarAsAgency.rows.length > 0, 'Agency user cannot read Cedarline meta_ads_metrics rows');

  const northpawRpcRows = await callSourcePerformance(northpawToken);
  const northpawRpcClientIds = new Set(northpawRpcRows.map((row) => row.client_id));
  assert(
    northpawRpcClientIds.size === 1 && northpawRpcClientIds.has(NORTHPAW_CLIENT_ID),
    `Northpaw RPC returned unexpected client IDs: ${Array.from(northpawRpcClientIds).join(', ')}`
  );

  const agencyRpcRows = await callSourcePerformance(agencyToken);
  const agencyRpcClientIds = new Set(agencyRpcRows.map((row) => row.client_id));
  assert(
    agencyRpcClientIds.has(NORTHPAW_CLIENT_ID) && agencyRpcClientIds.has(CEDARLINE_CLIENT_ID),
    `Agency RPC did not include both clients: ${Array.from(agencyRpcClientIds).join(', ')}`
  );

  console.log('Tenant isolation checks passed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

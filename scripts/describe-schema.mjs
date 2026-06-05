import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ansnstooqppdqiwrdqqi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuc25zdG9vcXBwZHFpd3JkcXFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTI3MzksImV4cCI6MjA5NjE4ODczOX0.G9rGVG2g5PJxvbGT_ecjJgcTXzCtiB-I_QyUf34Wszk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function describe() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'agency@skilltest.dev',
    password: 'Password123!'
  });
  
  if (authError) {
    console.error('AUTH ERROR:', authError);
    return;
  }
  
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Query table structure from information_schema
  // Note: RLS might block reading information_schema directly or restrict it. Let's try!
  const { data: columns, error: colError } = await client
    .from('meta_ads_metrics')
    .select('*')
    .limit(1);
    
  if (colError) {
    console.error('COLUMNS ERROR:', colError);
  } else {
    console.log('meta_ads_metrics cols:', Object.keys(columns[0] || {}));
  }

  const { data: opps, error: oppsError } = await client
    .from('opportunities')
    .select('*')
    .limit(1);
  console.log('opportunities cols:', Object.keys(opps?.[0] || {}));

  const { data: contacts, error: contactsError } = await client
    .from('contacts')
    .select('*')
    .limit(1);
  console.log('contacts cols:', Object.keys(contacts?.[0] || {}));
}

describe();

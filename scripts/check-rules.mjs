import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ansnstooqppdqiwrdqqi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuc25zdG9vcXBwZHFpd3JkcXFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTI3MzksImV4cCI6MjA5NjE4ODczOX0.G9rGVG2g5PJxvbGT_ecjJgcTXzCtiB-I_QyUf34Wszk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function check() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'agency@skilltest.dev',
    password: 'Password123!'
  });
  
  if (authError) {
    console.error('AUTH ERROR:', authError);
    return;
  }
  
  console.log('Signed in successfully! Token:', authData.session.access_token);
  
  // Set global authorization header or use standard client
  const authenticatedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: rules, error: rulesError } = await authenticatedClient.from('platform_tag_rules').select('*');
  console.log('RULES:', rulesError || rules);
  
  // Fetch contacts
  const { data: contacts, error: contactsError } = await authenticatedClient.from('contacts').select('*');
  console.log('CONTACTS COUNT:', contactsError || contacts?.length);
  
  console.log('CONTACTS (sample):');
  for (const c of (contacts || []).slice(0, 50)) {
    console.log(`Contact ID: ${c.id}, Source: ${c.source}, LastGen: ${c.last_general_source}, UTM: ${c.utm_source}/${c.utm_medium}, Tags: ${JSON.stringify(c.tags)}`);
  }
}

check();

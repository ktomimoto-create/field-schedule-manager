import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 別の人の Supabase プロジェクト (talk-script-flow 用の profiles 参照用)
const talkScriptUrl = 'https://bvhfmwrjrrqrpqvlzkyd.supabase.co';
const talkScriptAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2aGZtd3JqcnJxcnBxdmx6a3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODIwODcsImV4cCI6MjA4NTE1ODA4N30.MUKx28jIf6j7fVli6PDeUEYrHqRuCrgM7bpqZFjG9JA';

export const talkScriptSupabase = createClient(talkScriptUrl, talkScriptAnonKey);

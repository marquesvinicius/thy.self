import { createClient } from '@supabase/supabase-js';
import { env } from './environment.js';

export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

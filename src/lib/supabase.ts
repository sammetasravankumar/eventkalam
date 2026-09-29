import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type UserRole = 'user' | 'admin';

export type UserProfile = {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  created_at: string;
};

export type Registration = {
  registration_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  phone: string;
  seats: number;
  total_amount: number;
  registration_date: string;
  registration_status: 'registered' | 'cancelled' | 'attended';
};

export type EventRow = {
  event_id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  capacity: number;
  registered_count: number;
  price: number;
  image_url: string;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  registrations: Registration[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config, isConfigured } from "@/lib/config"

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(config.supabaseUrl!, config.supabaseAnonKey!)
  : null

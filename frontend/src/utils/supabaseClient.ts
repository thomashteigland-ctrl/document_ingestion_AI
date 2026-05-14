import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

console.log('Supabase config:', { supabaseUrl, supabaseAnonKey: supabaseAnonKey?.substring(0, 20) + '...' })

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

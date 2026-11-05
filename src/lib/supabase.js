import { createClient } from '@supabase/supabase-js'
import { CONFIG } from '../config'

// Supabase(창고)와 연결하는 통로
export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)

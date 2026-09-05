import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// supabase-js attaches `apikey` (and the bearer token) in its own fetch wrapper
// rather than on the request the query builder exposes, so a replayed request
// has to add it back. See outbox.js.
export const restApiKey = supabaseKey

// Base URL for edge functions (invoke() can't carry GET query params).
export const functionsUrl = `${supabaseUrl}/functions/v1`

// The functions gateway is on Supabase's newer key system and rejects the
// legacy anon JWT that the database client uses, so it needs the publishable
// key. Publishable keys are safe in the browser by design.
export const functionsKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || supabaseKey

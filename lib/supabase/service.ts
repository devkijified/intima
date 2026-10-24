import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for API routes that must act
 * beyond the caller's RLS (after their own checks pass). Never
 * import this from client code: the key is server-only.
 */
export function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Shared SEO constants and helpers: one source for the production
 * origin, the positioning line, and the read-only public client the
 * sitemap and metadata generators use. Everything here must work
 * with the public anon key only, and callers wrap reads in try/catch
 * so a failed query never takes a page or the sitemap down.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SITE_URL = 'https://intima-snowy.vercel.app';
export const SITE_NAME = 'Intima';
export const SITE_DESCRIPTION = 'The premier platform for verified companions.';
export const SITE_TAGLINE = 'Where Elegance Meets Connection';

/** Existing brand asset used for social cards until a dedicated OG image exists. */
export const OG_IMAGE_PATH = '/og.png';

/** Same slug shape the /city pages resolve against lib/cities names. */
export function cityToSlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Plain supabase-js client with the public anon key, for server-side public reads. */
export function publicAnonClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

/** Trim a free-text field into a meta description of at most ~160 chars. */
export function metaDescription(text: string | null | undefined, fallback: string): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return clean.length > 160 ? `${clean.slice(0, 157).trimEnd()}...` : clean;
}

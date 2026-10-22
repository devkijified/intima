import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Username claiming for members who signed up without one.
 * A username is the member's share link and profile handle, so it
 * is set once and never changes. GET checks availability live
 * while the member types; POST claims it.
 */

const RESERVED = new Set([
  'admin', 'intima', 'intimaapp', 'support', 'help', 'root', 'api',
  'c', 'comics', 'comic', 'live', 'map', 'login', 'signup',
  'dashboard', 'settings', 'profile', 'messages', 'board',
  'bookings', 'coins', 'perks', 'wallet', 'official', 'team',
  'staff', 'null', 'undefined',
]);

function normalise(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/** Returns a human reason the name cannot be used, or null if the shape is fine. */
function formatProblem(name: string): string | null {
  if (name.length === 0) return 'Type a username first.';
  if (name.length < 3) return 'Usernames need at least 3 characters.';
  if (name.length > 20) return 'Usernames can be at most 20 characters.';
  if (!/^[a-z]/.test(name)) return 'Your username must start with a letter.';
  if (!/^[a-z0-9_]+$/.test(name)) return 'Use only letters, numbers and underscores.';
  if (RESERVED.has(name)) return 'That username is reserved. Try another.';
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });

  const name = normalise(req.nextUrl.searchParams.get('check'));
  const problem = formatProblem(name);
  if (problem) return NextResponse.json({ available: false, reason: problem });

  const { data: holder } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', name)
    .maybeSingle();
  if (holder && holder.id !== user.id) {
    return NextResponse.json({ available: false, reason: 'That username is taken. Try another.' });
  }
  if (holder && holder.id === user.id) {
    return NextResponse.json({ available: false, reason: 'This is already your username.' });
  }
  return NextResponse.json({ available: true });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = normalise((body as { username?: unknown }).username);
  const problem = formatProblem(name);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.username) {
    return NextResponse.json(
      { error: 'Your username is already set and cannot be changed.' },
      { status: 409 },
    );
  }

  // The .is('username', null) guard plus the partial unique index on
  // profiles.username make the claim race safe: whoever lands first
  // wins, and a clash surfaces as a unique violation (23505).
  const { data, error } = await supabase
    .from('profiles')
    .update({ username: name })
    .eq('id', user.id)
    .is('username', null)
    .select('username')
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'That username is taken. Try another.' }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Something went wrong while saving your username. Please try again.' },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Your username is already set and cannot be changed.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true, username: name });
}

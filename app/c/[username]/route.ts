import { NextRequest, NextResponse } from 'next/server';

/**
 * Short dynamic link: /c/{username} lands on the companion's page.
 * Her shares always credit her: when no ref is supplied, ref defaults
 * to her own username.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  const username = params.username;
  const target = new URL(`/companion/${encodeURIComponent(username)}`, req.url);
  const incomingRef = req.nextUrl.searchParams.get('ref');
  target.searchParams.set('ref', incomingRef ?? username);
  return NextResponse.redirect(target, 302);
}

import { NextResponse } from 'next/server';

/** GET /api/coins/methods: which top-up rails are live. */
export async function GET() {
  return NextResponse.json({
    card: !!process.env.PAYSTACK_SECRET_KEY,
    transfer: true,
  });
}

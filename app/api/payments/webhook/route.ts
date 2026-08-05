import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const signature = request.headers.get('x-paystack-signature')

    // Verify webhook signature (in production)
    // For now, we'll just process the webhook

    const { event, data } = body

    // Handle different Paystack events
    switch (event) {
      case 'charge.success':
        await handleSuccessfulPayment(data)
        break
      case 'charge.failed':
        await handleFailedPayment(data)
        break
      default:
        console.log(`Unhandled event: ${event}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handleSuccessfulPayment(data: any) {
  const supabase = createClient()
  
  // Record the payment in your database
  const { error } = await supabase
    .from('payments')
    .insert({
      reference: data.reference,
      amount: data.amount / 100, // Convert from kobo
      currency: data.currency,
      status: 'completed',
      metadata: data.metadata,
      paid_at: new Date().toISOString(),
    })

  if (error) {
    console.error('Error recording payment:', error)
  }
}

async function handleFailedPayment(data: any) {
  const supabase = createClient()
  
  // Record failed payment
  const { error } = await supabase
    .from('payments')
    .insert({
      reference: data.reference,
      amount: data.amount / 100,
      currency: data.currency,
      status: 'failed',
      metadata: data.metadata,
      paid_at: null,
    })

  if (error) {
    console.error('Error recording failed payment:', error)
  }
}

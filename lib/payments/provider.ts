/**
 * Payment provider abstraction for the connection fee.
 *
 * IMPORTANT, READ BEFORE WIRING A REAL PROVIDER:
 * Paystack and Flutterwave both prohibit escort businesses in their
 * terms of service. Routing this platform's money through them risks
 * frozen funds and account termination. The real payment rail must be
 * cleared by legal counsel first. Until then, the app runs on
 * MockPaymentProvider below, and every user-facing string says
 * "Test mode" so nobody mistakes it for real money movement.
 *
 * To plug in a real provider later: implement PaymentProvider against
 * the counsel-approved rail and swap the export in
 * getPaymentProvider(). Nothing else in the app should change.
 */

export type PaymentStatus = 'paid' | 'failed' | 'pending'

export interface PaymentInitResult {
  /** Present when the provider uses a redirect/checkout page. */
  authorizationUrl?: string
  /** Provider-side reference for this transaction. */
  reference: string
}

export interface PaymentProvider {
  readonly name: string
  readonly testMode: boolean
  initialize(
    amountNgn: number,
    reference: string,
    metadata: Record<string, string>
  ): Promise<PaymentInitResult>
  verify(reference: string): Promise<PaymentStatus>
}

function makeReference(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `${prefix}_${Date.now().toString(36).toUpperCase()}_${rand}`
}

/**
 * Simulated provider for development and demos. Waits ~2 seconds,
 * then reports paid. NEVER use for real money.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MockPay (Test mode)'
  readonly testMode = true

  async initialize(
    amountNgn: number,
    reference: string,
    _metadata: Record<string, string>
  ): Promise<PaymentInitResult> {
    void _metadata
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (amountNgn <= 0) {
      throw new Error('Amount must be greater than zero')
    }
    return { reference: reference || makeReference('MOCK') }
  }

  async verify(_reference: string): Promise<PaymentStatus> {
    void _reference
    await new Promise((resolve) => setTimeout(resolve, 500))
    return 'paid'
  }
}

export function getPaymentProvider(): PaymentProvider {
  // Swap this line for the counsel-approved rail when it exists.
  return new MockPaymentProvider()
}

export function newPaymentReference(): string {
  return makeReference('INTIMA')
}

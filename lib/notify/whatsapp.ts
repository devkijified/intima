/**
 * WhatsApp notifications via the Meta WhatsApp Business Cloud API.
 * DORMANT BY DESIGN: this module sends nothing until the env vars
 * below are set. Every caller treats a not_configured result as a
 * normal no-op, so shipping this code changes nothing in production
 * until activation.
 *
 * Activation steps:
 *   1. Create a Meta app at developers.facebook.com and add the
 *      WhatsApp product to it.
 *   2. Connect a WhatsApp Business phone number to the app and note
 *      its phone number id (WhatsApp > API Setup in the app dashboard).
 *   3. Create a permanent access token for the app (a system user
 *      token with the whatsapp_business_messaging permission lasts;
 *      the temporary 24 hour token from the dashboard does not).
 *   4. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in Vercel
 *      (Project Settings > Environment Variables) and redeploy.
 *
 * Delivery note: freeform text like this only delivers inside
 * Meta's 24 hour customer service window, which opens when the
 * recipient messages the business number. Outside that window Meta
 * rejects freeform sends. Production should add approved template
 * messages later and send those for out-of-window notifications;
 * this helper covers the in-window case and the plumbing.
 */

export interface WhatsAppResult {
  sent: boolean
  reason?: string
}

/** Normalize a Nigerian number to international digits, no plus sign. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) {
    return '234' + digits.slice(1)
  }
  if (digits.startsWith('234')) {
    return digits
  }
  if (digits.length === 10 && /^[789]/.test(digits)) {
    return '234' + digits
  }
  return digits
}

/**
 * Send one WhatsApp text message. Never throws: every failure comes
 * back as { sent: false, reason } so notification fanout can treat
 * WhatsApp as strictly best effort.
 */
export async function sendWhatsAppText(
  phone: string,
  text: string
): Promise<WhatsAppResult> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  if (!token || !phoneId) {
    return { sent: false, reason: 'not_configured' }
  }
  const to = normalizePhone(phone)
  if (!to || !text) {
    return { sent: false, reason: 'request_failed' }
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    )
    if (!res.ok) {
      return { sent: false, reason: 'request_failed' }
    }
    return { sent: true }
  } catch {
    return { sent: false, reason: 'request_failed' }
  }
}

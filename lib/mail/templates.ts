// Branded email templates for Intima event mail.
// Server-only: imported by lib/mail/mailer.ts. Titles and bodies come
// from notification call sites and can contain user-influenced strings
// (display names, stream titles), so everything interpolated into the
// HTML is escaped first.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface EventEmailContent {
  html: string
  text: string
}

export interface EventEmailInput {
  title: string
  body?: string
  /** App-relative link from notifyUsers (e.g. "/messages/<id>"), if any. */
  link?: string
  /** Absolute app origin, no trailing slash (see lib/links siteOrigin). */
  appUrl: string
  /** Button label. Defaults to "Open in Intima". */
  buttonLabel?: string
}

const FOOTER =
  'You are getting this because you have an Intima account. Manage notifications in the app.'

/**
 * One branded template for every transactional event: cream backdrop,
 * white card, burgundy wordmark and button, the event title as the
 * heading, the notification body as the copy, one button into the app.
 * Table layout and inline styles only, for email-client compatibility.
 */
export function buildEventEmail(input: EventEmailInput): EventEmailContent {
  const title = input.title.trim()
  const body = input.body?.trim() ?? ''
  const target = input.link ? `${input.appUrl}${input.link}` : input.appUrl
  const buttonLabel = input.buttonLabel ?? 'Open in Intima'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#FDF9F6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FDF9F6;">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #eee3da;border-radius:16px;">
<tr>
<td style="padding:28px 32px 0 32px;">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:bold;letter-spacing:4px;color:#AC244D;">INTIMA</span>
</td>
</tr>
<tr>
<td style="padding:16px 32px 0 32px;">
<h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.35;color:#1A1A1A;">${escapeHtml(title)}</h1>
</td>
</tr>
${body ? `<tr>
<td style="padding:12px 32px 0 32px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1A1A1A;">${escapeHtml(body)}</p>
</td>
</tr>` : ''}
<tr>
<td style="padding:24px 32px 0 32px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td style="border-radius:999px;background-color:#AC244D;">
<a href="${escapeHtml(target)}" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(buttonLabel)}</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:28px 32px 28px 32px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a7f76;">${FOOTER}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`

  const textLines = [title]
  if (body) textLines.push('', body)
  textLines.push('', `${buttonLabel}: ${target}`, '', FOOTER)
  const text = textLines.join('\n')

  return { html, text }
}

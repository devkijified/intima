'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { friendlyAuthError } from '@/lib/auth/errors'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import { Mail } from '@/lib/icons'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      // Verify the account exists before sending, so a typo gets an
      // honest answer instead of a fake "Check your email". If the
      // check itself fails (network or server error), fall through
      // and send anyway: an infra hiccup must never block a real reset.
      let exists: boolean | null = null
      try {
        const res = await fetch('/api/auth/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (res.ok) {
          const data = await res.json()
          exists = data.exists === true
        }
      } catch {
        exists = null
      }
      if (exists === false) {
        setError('No account uses that email. Check the spelling, or create an account instead.')
        return
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setSent(true)
    } catch (err: any) {
      setError(friendlyAuthError(err, 'Could not send the reset email. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardHeader className="items-center space-y-1.5 text-center">
          {sent && (
            <span className="mb-1.5 flex h-14 w-14 items-center justify-center rounded-full bg-[#AC244D]/10 text-[#AC244D]">
              <Mail className="h-7 w-7" />
            </span>
          )}
          <CardTitle className="font-display text-3xl font-semibold tracking-tight text-charcoal">{sent ? 'Check your email' : 'Reset your password'}</CardTitle>
          <CardDescription className="text-[15px] text-neutral-500">
            {sent
              ? 'We sent a password reset link to your email. Tap it to choose a new password.'
              : 'Enter your account email and we will send you a reset link.'}
          </CardDescription>
        </CardHeader>
        {!sent && (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="forgot-email" className="text-sm font-medium text-charcoal">Email</label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" size="lg" disabled={loading} aria-busy={loading} className="w-full">
                {loading ? (
                  <span className="inline-flex items-center gap-2.5">
                    <IntimaLoader size="sm" />
                    Sending...
                  </span>
                ) : (
                  'Send reset link'
                )}
              </Button>
            </CardFooter>
          </form>
        )}
        <CardFooter className="justify-center">
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center rounded-full px-2 text-sm font-medium text-[#AC244D] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AC244D]/40"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

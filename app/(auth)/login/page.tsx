'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { friendlyAuthError, isEmailNotConfirmedError } from '@/lib/auth/errors'
import ResendConfirmation from '@/components/auth/ResendConfirmation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { IntimaLoader } from '@/components/shared/IntimaLoader'

/**
 * Returns the validated `?next=` redirect target, or null.
 * Only same-origin absolute paths are accepted (no protocol-relative URLs).
 */
function getNextParam(): string | null {
  if (typeof window === 'undefined') return null
  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const [nextParam] = useState<string | null>(() => getNextParam())
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setUnconfirmedEmail(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data.user) {
        // Use window.location for hard navigation, honoring ?next= when present
        window.location.href = nextParam ?? '/dashboard'
      }
    } catch (err: any) {
      if (isEmailNotConfirmedError(err)) {
        // Not a dead end: offer a fresh confirmation link for the
        // address they just tried to sign in with.
        setUnconfirmedEmail(email)
      } else {
        setError(friendlyAuthError(err, 'We could not sign you in. Please try again.'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardHeader className="space-y-1.5 text-center">
          <CardTitle className="font-display text-3xl font-semibold tracking-tight text-charcoal">Welcome back</CardTitle>
          <CardDescription className="text-[15px] text-neutral-500">
            Sign in to continue to Intima
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-sm font-medium text-charcoal">Email</label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setUnconfirmedEmail(null) }}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <PasswordInput
              id="login-password"
              label="Password"
              labelAction={
                <Link
                  href="/forgot-password"
                  className="inline-flex min-h-[44px] items-center rounded-full px-1 text-sm font-medium text-[#AC244D] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AC244D]/40"
                >
                  Forgot your password?
                </Link>
              }
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
            {error && (
              <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {unconfirmedEmail && <ResendConfirmation email={unconfirmedEmail} />}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2.5">
                  <IntimaLoader size="sm" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </Button>
            <p className="text-center text-sm text-neutral-600">
              Don&apos;t have an account?{' '}
              <Link
                href={nextParam ? `/signup?next=${encodeURIComponent(nextParam)}` : '/signup'}
                className="font-medium text-[#AC244D] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AC244D]/40 rounded-full px-0.5"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { friendlyAuthError } from '@/lib/auth/errors'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import { CheckCircle } from '@/lib/icons'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  // The recovery link signs the user in with a recovery session; once that
  // session exists, updateUser can set the new password.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setConfirmError(null)
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setConfirmError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
    } catch (err: any) {
      setError(friendlyAuthError(err, 'Could not update your password. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardHeader className="items-center space-y-1.5 text-center">
          {done && (
            <span className="mb-1.5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-7 w-7" />
            </span>
          )}
          <CardTitle className="font-display text-3xl font-semibold tracking-tight text-charcoal">{done ? 'Password updated' : 'Choose a new password'}</CardTitle>
          <CardDescription className="text-[15px] text-neutral-500">
            {done
              ? 'Your password has been changed. Sign in with it to continue.'
              : ready
                ? 'Enter your new password below.'
                : 'Verifying your reset link...'}
          </CardDescription>
        </CardHeader>
        {!done && ready && (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <PasswordInput
                id="reset-password"
                label="New password"
                value={password}
                onChange={setPassword}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                error={passwordError}
              />
              <PasswordInput
                id="reset-password-confirm"
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                placeholder="Repeat the new password"
                autoComplete="new-password"
                required
                error={confirmError}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" size="lg" disabled={loading} aria-busy={loading} className="w-full">
                {loading ? (
                  <span className="inline-flex items-center gap-2.5">
                    <IntimaLoader size="sm" />
                    Updating...
                  </span>
                ) : (
                  'Update password'
                )}
              </Button>
            </CardFooter>
          </form>
        )}
        {!done && !ready && (
          <CardContent>
            {error && (
              <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="flex flex-col items-center gap-3 py-2">
              <IntimaLoader size="md" />
              <p className="text-center text-sm text-neutral-500">
                If the link expired, request a new one.
              </p>
            </div>
          </CardContent>
        )}
        <CardFooter className="justify-center">
          <Link
            href={done ? '/login' : '/forgot-password'}
            className="inline-flex min-h-[44px] items-center rounded-full px-2 text-sm font-medium text-[#AC244D] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AC244D]/40"
          >
            {done ? 'Sign in' : 'Request a new link'}
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

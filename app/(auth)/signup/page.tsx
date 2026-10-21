'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { TikTokLoader } from '@/components/shared/TikTokLoader'
import { CheckCircle } from '@/lib/icons'
import { cn } from '@/lib/utils/helpers'

/**
 * Returns the validated `?next=` redirect target, or null.
 * Only same-origin absolute paths are accepted (no protocol-relative URLs).
 */
function getNextParam(): string | null {
  if (typeof window === 'undefined') return null
  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

/** Plain-words, length-only password hint. Guidance, never a gate. */
function passwordHint(password: string): { label: string; bars: number; barClass: string } | null {
  if (password.length === 0) return null
  if (password.length < 8) {
    return { label: 'Too short. Use at least 8 characters.', bars: 1, barClass: 'bg-red-400' }
  }
  if (password.length < 12) {
    return { label: 'Good length. Longer is even safer.', bars: 2, barClass: 'bg-[#C9A84C]' }
  }
  return { label: 'Strong password.', bars: 3, barClass: 'bg-emerald-500' }
}

const ROLE_OPTIONS = [
  { value: 'model', label: 'Model' },
  { value: 'client', label: 'Client' },
] as const

export default function SignupPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    role: 'client' as 'model' | 'client',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [nextParam] = useState<string | null>(() => getNextParam())
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            phone: formData.phone,
            role: formData.role,
            referred_by: (() => { try { return localStorage.getItem('intima_ref') } catch { return null } })(),
          },
        },
      })

      if (authError) throw authError

      // Profile row is created server-side by the on_auth_user_created trigger
      // (uses the metadata passed above). Nothing to insert client-side.
      if (authData.user) {
        if (authData.session) {
          // No email confirmation required: session is live, go back.
          if (nextParam) {
            window.location.href = nextParam
            return
          }
          window.location.href = '/'
          return
        }
        // Email confirmation required: tell them to check their inbox.
        setNeedsConfirm(true)
        setSuccess(true)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during signup')
    } finally {
      setLoading(false)
    }
  }

  const hint = passwordHint(formData.password)

  if (success) {
    return (
      <div className="w-full">
        <Card className="w-full">
          <CardHeader className="items-center space-y-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-7 w-7" />
            </span>
            <CardTitle className="font-display text-3xl font-semibold tracking-tight text-charcoal">Account created</CardTitle>
            <CardDescription className="text-[15px] text-neutral-500">
              {needsConfirm
                ? 'Check your email to confirm your account, then sign in.'
                : 'Your account has been created successfully.'}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login'} className="w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AC244D]/40">
              <Button size="lg" className="w-full">
                Sign In Now
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardHeader className="space-y-1.5 text-center">
          <CardTitle className="font-display text-3xl font-semibold tracking-tight text-charcoal">Create your account</CardTitle>
          <CardDescription className="text-[15px] text-neutral-500">Join Intima: verified, private, direct</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="signup-full-name" className="text-sm font-medium text-charcoal">Full Name</label>
              <Input
                id="signup-full-name"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Your full name"
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="signup-email" className="text-sm font-medium text-charcoal">Email</label>
              <Input
                id="signup-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="signup-phone" className="text-sm font-medium text-charcoal">Phone Number</label>
              <Input
                id="signup-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="0803 000 0000"
                autoComplete="tel"
                required
              />
            </div>
            <div className="space-y-2">
              <PasswordInput
                id="signup-password"
                label="Password"
                value={formData.password}
                onChange={(value) => setFormData({ ...formData, password: value })}
                placeholder="Password (min 8 characters)"
                autoComplete="new-password"
                required
              />
              {hint && (
                <div aria-live="polite">
                  <div className="flex gap-1" aria-hidden>
                    {[1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn('h-1 flex-1 rounded-full bg-neutral-200', i <= hint.bars && hint.barClass)}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-neutral-500">{hint.label}</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <span id="signup-role-label" className="block text-sm font-medium text-charcoal">Join as</span>
              <div
                role="radiogroup"
                aria-labelledby="signup-role-label"
                className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1"
              >
                {ROLE_OPTIONS.map((option) => (
                  <label key={option.value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value={option.value}
                      checked={formData.role === option.value}
                      onChange={() => setFormData({ ...formData, role: option.value })}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        'flex min-h-[48px] items-center justify-center rounded-xl text-sm font-medium text-neutral-500 transition-all',
                        'peer-checked:bg-white peer-checked:font-semibold peer-checked:text-charcoal peer-checked:shadow-sm peer-checked:ring-1 peer-checked:ring-black/5',
                        'peer-focus-visible:ring-2 peer-focus-visible:ring-[#AC244D]/40'
                      )}
                    >
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {error && (
              <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" size="lg" className="w-full" disabled={loading} aria-busy={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2.5">
                  <TikTokLoader size="sm" />
                  Creating...
                </span>
              ) : (
                'Create Account'
              )}
            </Button>
            <p className="text-center text-xs leading-relaxed text-neutral-500">
              By creating an account you agree to Intima&apos;s terms of use and privacy policy.
              You must be 18 or older to join.
            </p>
            <p className="text-center text-sm text-neutral-600">
              Already have an account?{' '}
              <Link
                href={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login'}
                className="rounded-full px-0.5 font-medium text-[#AC244D] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AC244D]/40"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

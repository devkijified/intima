'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'

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
      setError(err.message || 'Could not send the reset email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <Card className="w-full border-0 shadow-none md:border md:shadow-soft">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="font-display text-3xl font-semibold tracking-tight">{sent ? 'Check your email' : 'Reset your password'}</CardTitle>
          <CardDescription>
            {sent
              ? 'We sent a password reset link to your email. Tap it to choose a new password.'
              : 'Enter your account email and we will send you a reset link.'}
          </CardDescription>
        </CardHeader>
        {!sent && (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={loading} className="w-full bg-[#AC244D] hover:bg-[#8F1D40]">
                {loading ? 'Sending...' : 'Send reset link'}
              </Button>
            </CardFooter>
          </form>
        )}
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-[#AC244D] hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

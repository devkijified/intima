'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Could not update the password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <Card className="w-full border-0 shadow-none md:border md:shadow-soft">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">{done ? 'Password updated' : 'Choose a new password'}</CardTitle>
          <CardDescription>
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
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="space-y-2">
                <label className="text-sm font-medium">New password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm new password</label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat the new password" required />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={loading} className="w-full bg-[#AC244D] hover:bg-[#8F1D40]">
                {loading ? 'Updating...' : 'Update password'}
              </Button>
            </CardFooter>
          </form>
        )}
        {!done && !ready && (
          <CardContent>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <p className="text-center text-sm text-neutral-500">
              If the link expired, request a new one.
            </p>
          </CardContent>
        )}
        <CardFooter className="justify-center">
          <Link href={done ? '/login' : '/forgot-password'} className="text-sm text-[#AC244D] hover:underline">
            {done ? 'Sign in' : 'Request a new link'}
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'

/**
 * Returns the validated `?next=` redirect target, or null.
 * Only same-origin absolute paths are accepted (no protocol-relative URLs).
 */
function getNextParam(): string | null {
  if (typeof window === 'undefined') return null
  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

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

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center text-green-600">✅ Account Created!</CardTitle>
            <CardDescription className="text-center">
              {needsConfirm
                ? 'Check your email to confirm your account, then sign in.'
                : 'Your account has been created successfully.'}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login'} className="w-full">
              <Button className="w-full bg-[#AC244D] hover:bg-[#8F1D40]">
                Sign In Now
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Create Account</CardTitle>
          <CardDescription className="text-center">Join Intima today</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <Input
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="Full Name"
              required
            />
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Email"
              required
            />
            <Input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Phone Number"
              required
            />
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Password (min 8 characters)"
              required
            />
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="model"
                  checked={formData.role === 'model'}
                  onChange={() => setFormData({ ...formData, role: 'model' })}
                />
                Model
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="client"
                  checked={formData.role === 'client'}
                  onChange={() => setFormData({ ...formData, role: 'client' })}
                />
                Client
              </label>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full bg-[#AC244D] hover:bg-[#8F1D40]" disabled={loading}>
              {loading ? 'Creating...' : 'Create Account'}
            </Button>
            <p className="text-sm text-gray-600">
              Already have an account? <Link href={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login'} className="text-[#AC244D] hover:underline">Sign in</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

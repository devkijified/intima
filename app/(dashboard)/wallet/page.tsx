'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wallet, Info } from 'lucide-react'

export default function WalletPage() {
  const [role, setRole] = useState('client')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: profile } = await supabase.from('profiles')
        .select('role').eq('id', user.id).maybeSingle()
      setRole(profile?.role ?? 'client')
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-charcoal">Wallet</h1>

      <div className="mt-6 rounded-3xl bg-gradient-to-r from-primary to-[#D43A6B] p-6 text-white">
        <p className="text-sm text-white/80">Available Balance</p>
        <p className="mt-1 text-4xl font-bold">N0</p>
        <p className="mt-2 text-xs text-white/70">
          {role === 'model'
            ? 'Your earnings from paid live streams will appear here.'
            : 'Connection fees you pay will appear here.'}
        </p>
      </div>

      <div className="mt-6 rounded-3xl border border-neutral-200/80 bg-white p-6">
        <h2 className="font-semibold text-charcoal">Transaction History</h2>
        <div className="mt-4 rounded-2xl bg-cream p-8 text-center">
          <Wallet className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-2 text-sm font-medium text-charcoal">No transactions yet</p>
          <p className="mt-1 flex items-center justify-center gap-1 text-xs text-neutral-500">
            <Info className="h-3 w-3" />
            Payments are in test mode. Real rails after legal review.
          </p>
        </div>
      </div>
    </div>
  )
}

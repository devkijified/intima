'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Wallet, ArrowUpRight, ArrowDownRight, Plus } from 'lucide-react'

export default function WalletPage() {
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function fetchWallet() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get wallet balance (you'll need to create a wallets table)
      // For now, using mock data
      setBalance(15000)
      setTransactions([
        { id: 1, type: 'credit', amount: 5000, description: 'Tip from client', date: '2024-01-15' },
        { id: 2, type: 'debit', amount: 2000, description: 'Withdrawal to bank', date: '2024-01-14' },
        { id: 3, type: 'credit', amount: 8000, description: 'Booking payment', date: '2024-01-13' },
      ])
      setLoading(false)
    }

    fetchWallet()
  }, [supabase])

  if (loading) {
    return <div className="text-center py-10">Loading wallet...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Wallet</h1>

      {/* Balance Card */}
      <Card className="bg-gradient-to-r from-[#AC244D] to-[#D43A6B] text-white mb-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">Available Balance</p>
              <p className="text-4xl font-bold mt-1">₦{balance.toLocaleString()}</p>
            </div>
            <Wallet className="h-12 w-12 text-white/30" />
          </div>
          <div className="flex gap-4 mt-6">
            <Button className="bg-white text-[#AC244D] hover:bg-white/90">
              <Plus className="mr-2 h-4 w-4" />
              Fund Wallet
            </Button>
            <Button variant="outline" className="border-white text-white hover:bg-white/10">
              <ArrowUpRight className="mr-2 h-4 w-4" />
              Withdraw
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Earned</p>
              <p className="text-xl font-bold text-gray-900">₦25,000</p>
            </div>
            <ArrowUpRight className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Withdrawn</p>
              <p className="text-xl font-bold text-gray-900">₦10,000</p>
            </div>
            <ArrowDownRight className="h-8 w-8 text-red-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-xl font-bold text-gray-900">₦0</p>
            </div>
            <Wallet className="h-8 w-8 text-yellow-500" />
          </CardContent>
        </Card>
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No transactions yet</p>
          ) : (
            <div className="space-y-4">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between border-b border-gray-100 pb-4 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-full p-2 ${
                      tx.type === 'credit' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {tx.type === 'credit' ? (
                        <ArrowUpRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tx.description}</p>
                      <p className="text-sm text-gray-500">{tx.date}</p>
                    </div>
                  </div>
                  <p className={`font-bold ${
                    tx.type === 'credit' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.type === 'credit' ? '+' : '-'}₦{tx.amount.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

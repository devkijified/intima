'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function HomePage() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/dashboard')
      } else {
        router.replace('/login')
      }
      setLoading(false)
    }
    checkAuth()
  }, [router, supabase])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#AC244D] mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from '@/lib/icons'

// The map IS the landing page: full-screen, guest-accessible discovery.
// See first, order second. Lazy-loaded so the first paint stays light.
const IntimaMap = dynamic(() => import('@/components/map/IntimaMap'), {
  ssr: false,
  loading: () => (
    <div
      className="flex flex-col items-center justify-center gap-3 bg-[#111118] text-neutral-400"
      style={{ height: '100dvh' }}
    >
      <span className="font-serif text-2xl tracking-tight text-white">Intima</span>
      <Loader2 className="h-8 w-8 animate-spin text-[#AC244D]" />
    </div>
  ),
})

export default function HomePage() {
  return <IntimaMap />
}

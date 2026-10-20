import type { Metadata } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import './globals.css'
import { AgeGate } from '@/components/AgeGate'
import { SplashDismiss } from '@/components/SplashDismiss'
import { CallProvider } from '@/components/calls/CallProvider'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { ConnectionMonitor } from '@/components/pwa/ConnectionMonitor'

// One pairing for the whole product: Fraunces for display (wordmark,
// headings, prices, sheet titles) and Inter for everything else. Loaded
// once via next/font, latin subset, display=swap, no CSS @imports.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const viewport = { viewportFit: 'cover', themeColor: '#AC244D' };

export const metadata: Metadata = {
  title: 'Intima - Premium Companion Platform',
  description: "Nigeria's premier platform for verified companions.",
  manifest: '/manifest.webmanifest',
  themeColor: '#AC244D',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Intima',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        {/* Critical paint: burgundy before any CSS/JS loads, kills the white flash. */}
        <style dangerouslySetInnerHTML={{ __html: `html,body{background:#FDF9F6;margin:0;padding:0;min-height:100dvh}#app-splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#C22A57 0%,#8F1D40 100%)}` }} />
      </head>
      <body>
        {/* In-app splash: server-rendered so it paints before JS loads. */}
        <div id="app-splash">
          <div className="splash-mark">I</div>
          <div className="splash-word">INTIMA</div>
          <div className="splash-tag">Where Elegance Meets Connection</div>
        </div>
        <SplashDismiss />
        {/* AgeGate still blocks everything until verified. CallProvider sits
            inside it so voice/video calls work on every route, including the
            public map landing page. */}
        <AgeGate>
          <CallProvider>{children}</CallProvider>
          <InstallPrompt />
          <ConnectionMonitor />
        </AgeGate>
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', function() { navigator.serviceWorker.register('/sw.js').catch(function(){}); }); }`,
          }}
        />
      </body>
    </html>
  )
}

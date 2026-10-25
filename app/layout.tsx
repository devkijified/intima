import type { Metadata } from 'next'
import { Figtree } from 'next/font/google'
import './globals.css'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, OG_IMAGE_PATH } from '@/lib/seo'
import { AgeGate } from '@/components/AgeGate'
import { SplashDismiss } from '@/components/SplashDismiss'
import PushAutoSubscribe from '@/components/PushAutoSubscribe'
import RefCapture from '@/components/RefCapture'
import { CallProvider } from '@/components/calls/CallProvider'
import { DockProvider } from '@/components/dock/FloatingDock'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { PrivacyVeil } from '@/components/privacy/PrivacyVeil'
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'
import { ConnectionMonitor } from '@/components/pwa/ConnectionMonitor'
import { ToastHost } from '@/components/shared/ToastHost'
import { PageViewBeacon } from '@/components/analytics/PageViewBeacon'
import { LastSeenHeartbeat } from '@/components/presence/LastSeenHeartbeat'

import { QueryLoadingWidget } from '@/components/shared/QueryLoadingWidget'
import ErrorReporter from '@/components/observability/ErrorReporter'

// One pairing for the whole product: Aeonik Pro Bold for display
// (wordmark, headings, prices, sheet titles; self-hosted from
// public/fonts, exposed as --font-inter in globals.css) and Figtree
// for everything else via next/font.
const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

export const viewport = { viewportFit: 'cover', themeColor: '#AC244D' };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Intima · Premium Companion Platform',
    template: '%s · Intima',
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: 'Intima · Premium Companion Platform',
    description: SITE_DESCRIPTION,
    url: '/',
    images: [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: 'Intima' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Intima · Premium Companion Platform',
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_PATH],
  },
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
    <html lang="en" className={`${figtree.variable}`}>
      <head>
        {/* Aeonik Pro Bold is self-hosted (public/fonts, @font-face in
            globals.css): preload the woff2 so display text paints in
            the right face without waiting on the CSS chain. */}
        <link rel="preload" href="/fonts/aeonik-pro-bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Critical paint: burgundy before any CSS/JS loads, kills the white flash. */}
        <style dangerouslySetInnerHTML={{ __html: `html,body{background:#FDF9F6;margin:0;padding:0;min-height:100dvh}#app-splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#C22A57 0%,#8F1D40 100%)}` }} />
      </head>
      <body>
        {/* Structured data: who Intima is, in the shape search engines read. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  name: SITE_NAME,
                  url: SITE_URL,
                  logo: `${SITE_URL}${OG_IMAGE_PATH}`,
                  description: SITE_DESCRIPTION,
                },
                {
                  '@type': 'WebSite',
                  name: SITE_NAME,
                  url: SITE_URL,
                  description: SITE_DESCRIPTION,
                },
              ],
            }),
          }}
        />
        {/* In-app splash: server-rendered so it paints before JS loads. */}
        <div id="app-splash">
          <div className="splash-mark">I</div>
          <div className="splash-word">INTIMA</div>
          <div className="splash-tag">Welcome to Sincity (no one has to know)</div>
        </div>
        <SplashDismiss />
        <ErrorReporter />
        <PushAutoSubscribe />
        <RefCapture />
        {/* AgeGate still blocks everything until verified. CallProvider sits
            inside it so voice/video calls work on every route, including the
            public map landing page. */}
        <AgeGate>
          <CallProvider>
            <DockProvider>{children}</DockProvider>
          </CallProvider>
          <PrivacyVeil />
          <InstallPrompt />
          <UpdatePrompt />
          <ConnectionMonitor />
          <QueryLoadingWidget />
          <PageViewBeacon />
          <LastSeenHeartbeat />
          <ToastHost />
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

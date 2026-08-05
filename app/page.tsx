import Link from 'next/link'
import { Shield, Video, Star, Users, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-brand-muted to-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-20 md:py-28">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="mb-6 text-5xl font-bold tracking-tight md:text-7xl">
            <span className="text-brand">Intima</span>
            <span className="block text-gray-900">Redefining Connection</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-600">
            Nigeria's premier platform for verified companions. 
            Safe, sophisticated, and built for the future.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="bg-brand hover:bg-brand-dark">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/models/browse">
              <Button variant="outline" size="lg">
                Browse Models
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
            Why Choose <span className="text-brand">Intima</span>?
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<Shield className="h-8 w-8 text-brand" />}
              title="Verified Profiles"
              description="Every model is verified through ID and live video checks"
            />
            <FeatureCard
              icon={<Video className="h-8 w-8 text-brand" />}
              title="Live Streaming"
              description="Connect in real-time with private and public live shows"
            />
            <FeatureCard
              icon={<Star className="h-8 w-8 text-brand" />}
              title="Premium Experience"
              description="High-end design and features that set us apart"
            />
            <FeatureCard
              icon={<Users className="h-8 w-8 text-brand" />}
              title="Safe Community"
              description="Two-way blacklist system and emergency features"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-16 bg-brand">
        <div className="mx-auto max-w-4xl text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Join Intima?</h2>
          <p className="text-lg mb-8 text-brand-muted">
            Become part of Nigeria's most trusted companion platform
          </p>
          <Link href="/signup">
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-brand">
              Create Your Account
            </Button>
          </Link>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({ icon, title, description }: any) {
  return (
    <div className="rounded-xl bg-white p-6 text-center shadow-sm hover:shadow-md transition-shadow">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  )
}

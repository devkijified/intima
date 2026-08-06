'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Shield, Star, Clock, Heart, Camera, MapPin, Award } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/dashboard')
      }
    }
    checkAuth()
  }, [router, supabase])

  return (
    <div className="min-h-screen bg-cream">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-cream to-secondary/10" />
        
        {/* Decorative Elements */}
        <div className="absolute top-20 right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-6xl mx-auto text-center">
          <div className="inline-block px-6 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
            ✦ Premium Companion Platform
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-charcoal leading-tight">
            Where Elegance{' '}
            <span className="gold-text">Meets</span>
            <br />
            <span className="text-primary">Connection</span>
          </h1>
          
          <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Discover exceptional companions in Nigeria. 
            Verified, sophisticated, and curated for the discerning.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <button 
              onClick={() => window.location.href = '/signup'}
              className="btn-luxury flex items-center gap-2"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </button>
            <button 
              onClick={() => window.location.href = '/login'}
              className="btn-outline-luxury"
            >
              Sign In
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span>Verified Profiles</span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-secondary" />
              <span>Curated Selection</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <span>24/7 Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-charcoal">Designed for <span className="text-primary">Excellence</span></h2>
            <p className="mt-4 text-gray-600">Every detail crafted for a premium experience</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Shield className="w-8 h-8 text-primary" />}
              title="Verified Identity"
              description="Every companion undergoes thorough verification including ID checks and live confirmation"
            />
            <FeatureCard 
              icon={<Camera className="w-8 h-8 text-primary" />}
              title="Curated Portfolios"
              description="High-quality galleries and detailed bios to help you make the perfect choice"
            />
            <FeatureCard 
              icon={<MapPin className="w-8 h-8 text-primary" />}
              title="Service Areas"
              description="Find companions in Lagos, Abuja, Port Harcourt, and across Nigeria"
            />
            <FeatureCard 
              icon={<Award className="w-8 h-8 text-primary" />}
              title="Verified Reviews"
              description="Real feedback from verified clients to ensure trust and transparency"
            />
            <FeatureCard 
              icon={<Heart className="w-8 h-8 text-primary" />}
              title="Safe Community"
              description="Two-way blacklist system and emergency features for peace of mind"
            />
            <FeatureCard 
              icon={<Star className="w-8 h-8 text-secondary" />}
              title="Premium Support"
              description="Dedicated support team available around the clock for all users"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-primary">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-4xl font-bold">Ready to Experience <span className="text-secondary">Luxury</span>?</h2>
          <p className="mt-4 text-primary-light text-lg">Join Nigeria's most trusted companion platform</p>
          <button 
            onClick={() => window.location.href = '/signup'}
            className="mt-8 bg-white text-primary px-10 py-4 rounded-full font-medium 
                     hover:bg-secondary hover:text-white transition-all duration-300 
                     shadow-lg shadow-white/20"
          >
            Create Your Account
          </button>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({ icon, title, description }: any) {
  return (
    <div className="group p-8 rounded-2xl bg-cream hover:bg-white transition-all duration-300 
                    hover:shadow-xl hover:-translate-y-1 border border-transparent hover:border-primary/10">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4 
                      group-hover:bg-primary/20 transition-all">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-charcoal mb-2">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  )
}

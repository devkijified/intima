'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModelCard } from '@/components/models/ModelCard'
import { ModelFilters } from '@/components/models/ModelFilters'
import { Input } from '@/components/ui/Input'
import { Search, Sparkles, Filter, Grid, List } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Model {
  id: string
  display_name: string
  age: number
  city: string
  state: string
  rate_per_hour: number
  bio: string
  rating_avg: number
  review_count: number
  is_available: boolean
  is_verified: boolean
  is_new: boolean
  profile_id: string
  profiles: {
    avatar_url: string
  }
  specialties: string[]
}

export default function BrowseModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [filters, setFilters] = useState({
    city: '',
    minRate: '',
    maxRate: '',
    availability: 'available', // Default to available matching Tryst's active category view
  })
  const supabase = createClient()

  useEffect(() => {
    async function fetchModels() {
      let query = supabase
        .from('model_profiles')
        .select(`
          *,
          profiles:profile_id (
            avatar_url
          )
        `)

      if (filters.availability === 'available') {
        query = query.eq('is_available', true)
      } else if (filters.availability === 'offline') {
        query = query.eq('is_available', false)
      }

      if (search) {
        query = query.ilike('display_name', `%${search}%`)
      }
      if (filters.city) {
        query = query.eq('city', filters.city)
      }
      if (filters.minRate) {
        query = query.gte('rate_per_hour', parseInt(filters.minRate))
      }
      if (filters.maxRate) {
        query = query.lte('rate_per_hour', parseInt(filters.maxRate))
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching models:', error)
      } else {
        // Add some mock data for demo purposes
        const enhancedData = data?.map((model: any) => ({
          ...model,
          is_verified: Math.random() > 0.3,
          is_new: Math.random() > 0.7,
          specialties: ['Massage', 'Dinner Date', 'Travel Companion'].slice(0, Math.floor(Math.random() * 3) + 1),
        })) || []
        setModels(enhancedData)
      }
      setLoading(false)
    }

    fetchModels()
  }, [search, filters, supabase])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#AC244D] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      
      {/* Category Header - Tryst inspired */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-200/80 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs uppercase tracking-widest font-semibold text-emerald-600">
              Live Directory Category
            </span>
          </div>
          <h1 className="text-3xl font-serif font-normal text-neutral-900 tracking-tight">
            Companions Available Now
          </h1>
          <p className="text-neutral-500 text-sm mt-1">
            Browse verified independent companions ready for immediate rendezvous and connections.
          </p>
        </div>

        <div className="bg-neutral-100 px-4 py-2 rounded-full text-xs font-medium text-neutral-600 self-start md:self-auto border border-neutral-200">
          {models.length} verified listings active
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        
        {/* Filters Sidebar - Desktop */}
        <div className="hidden lg:block lg:w-72 shrink-0">
          <div className="sticky top-6">
            <ModelFilters filters={filters} setFilters={setFilters} />
          </div>
        </div>

        {/* Main Grid Area */}
        <div className="flex-1 space-y-6">
          
          {/* Search and Controls Toolbar */}
          <div className="bg-white p-4 border border-neutral-200/85 rounded-2xl shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companions by name..."
                className="pl-10 bg-neutral-50 border-neutral-200 focus:bg-white transition-all rounded-xl"
              />
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Mobile Filter Toggle */}
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>

              {/* View Toggle */}
              <div className="flex border border-neutral-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 transition-colors ${
                    viewMode === 'grid' 
                      ? 'bg-primary text-white' 
                      : 'bg-white text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  <Grid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 transition-colors ${
                    viewMode === 'list' 
                      ? 'bg-primary text-white' 
                      : 'bg-white text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Filters */}
          {showMobileFilters && (
            <div className="lg:hidden bg-white p-4 rounded-2xl border border-neutral-200/85">
              <ModelFilters filters={filters} setFilters={setFilters} />
            </div>
          )}

          {/* Results Count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">
              Showing <span className="font-semibold text-neutral-900">{models.length}</span> companions
            </p>
          </div>

          {/* Grid Layout */}
          <div className={`
            grid gap-6 
            ${viewMode === 'grid' 
              ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' 
              : 'grid-cols-1'
            }
          `}>
            {models.map((model) => (
              <ModelCard key={model.id} model={model} />
            ))}
          </div>

          {/* Empty State */}
          {models.length === 0 && (
            <div className="text-center py-20 bg-white border border-neutral-200/85 rounded-2xl p-8">
              <Sparkles className="h-8 w-8 text-neutral-400 mx-auto mb-3" />
              <h3 className="font-serif text-lg text-neutral-900 mb-1">No companions found</h3>
              <p className="text-sm text-neutral-500 max-w-sm mx-auto">
                No active profiles match your specific filters or availability criteria right now. Try loosening your filters.
              </p>
            </div>
          )}

          {/* Load More */}
          {models.length > 0 && models.length >= 12 && (
            <div className="text-center pt-4">
              <Button variant="outline" className="px-8">
                Load More
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

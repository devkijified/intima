'use client'

import { PullToRefresh } from '@/components/shared/PullToRefresh'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModelCard } from '@/components/models/ModelCard'
import { ModelFilters } from '@/components/models/ModelFilters'
import { Input } from '@/components/ui/Input'
import { Search, Sparkles, Filter, Grid, List } from '@/lib/icons'
import { Button } from '@/components/ui/Button'
import { resolveServices } from '@/lib/services'

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
  is_featured?: boolean
  created_at?: string
  services?: string[] | null
  profile_id: string
  /** Auth user id of the provider, used as the call target. */
  userId?: string | null
  profiles: {
    avatar_url: string
    gallery_urls?: string[] | null
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

  async function fetchModels() {
    let query = supabase
      .from('model_profiles')
      .select(`
        *,
        profiles:profile_id (
          avatar_url,
          gallery_urls
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
      // Bind every card field to the row itself: verification and
      // featured flags as stored, New derived from created_at
      // (14 days), specialties resolved from her services slugs
      // through the catalog, falling back to the stored specialties
      // list only when she has no catalog services recorded.
      const enhancedData = data?.map((model: any) => {
        const fromServices = resolveServices(model.services).map((s) => s.label)
        return {
          ...model,
          userId: model.profile_id ?? null,
          is_verified: model.is_verified ?? false,
          is_featured: model.is_featured ?? false,
          is_new: model.created_at
            ? Date.now() - new Date(model.created_at).getTime() < 14 * 24 * 3600 * 1000
            : false,
          specialties: fromServices.length > 0
            ? fromServices
            : (Array.isArray(model.specialties) ? model.specialties : []),
        }
      }) || []
      setModels(enhancedData)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters, supabase])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#AC244D] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={() => fetchModels()} className="space-y-6">
      
      {/* Category Header - Tryst inspired */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-200/80 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs uppercase tracking-widest font-semibold text-emerald-600">
              Live Directory Category
            </span>
          </div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-neutral-900">
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
              <Search aria-hidden className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
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
                <Filter aria-hidden className="h-4 w-4 mr-2" />
                Filters
              </Button>

              {/* View Toggle */}
              <div className="flex border border-neutral-200 rounded-lg overflow-hidden">
                <button
                  aria-label="Grid view"
                  onClick={() => setViewMode('grid')}
                  className={`inline-flex h-11 w-11 items-center justify-center transition-colors ${
                    viewMode === 'grid' 
                      ? 'bg-primary text-white' 
                      : 'bg-white text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  <Grid aria-hidden className="h-4 w-4" />
                </button>
                <button
                  aria-label="List view"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex h-11 w-11 items-center justify-center transition-colors ${
                    viewMode === 'list' 
                      ? 'bg-primary text-white' 
                      : 'bg-white text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  <List aria-hidden className="h-4 w-4" />
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
              <ModelCard key={model.id} model={model} layout={viewMode} />
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
    </PullToRefresh>
  )
}

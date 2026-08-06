'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModelCard } from '@/components/models/ModelCard'
import { ModelFilters } from '@/components/models/ModelFilters'
import { Input } from '@/components/ui/Input'
import { Search } from 'lucide-react'

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
  profile_id: string
  profiles: {
    avatar_url: string
  }
}

export default function BrowseModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    city: '',
    minRate: '',
    maxRate: '',
    availability: 'all',
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
        setModels(data || [])
      }
      setLoading(false)
    }

    fetchModels()
  }, [search, filters, supabase])

  if (loading) {
    return <div className="text-center py-10">Loading models...</div>
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Browse Models</h1>
        <p className="text-gray-600 mt-1">Discover verified companions in Nigeria</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="lg:w-72">
          <ModelFilters filters={filters} setFilters={setFilters} />
        </div>

        <div className="flex-1">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name..."
                className="pl-10"
              />
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {models.length} models found
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {models.map((model) => (
              <ModelCard key={model.id} model={model} />
            ))}
          </div>

          {models.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600">No models found matching your criteria</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

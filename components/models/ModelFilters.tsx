'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Sliders, X } from 'lucide-react'

interface Filters {
  city: string
  minRate: string
  maxRate: string
  availability: string
}

interface ModelFiltersProps {
  filters: Filters
  setFilters: (filters: Filters) => void
}

export function ModelFilters({ filters, setFilters }: ModelFiltersProps) {
  const cities = ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Enugu', 'Kaduna', 'Benin City']

  const handleChange = (key: keyof Filters, value: string) => {
    setFilters({ ...filters, [key]: value })
  }

  const hasActiveFilters = filters.city || filters.minRate || filters.maxRate || filters.availability !== 'all'

  return (
    <Card className="border-neutral-200/85 rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
          <Sliders className="h-4 w-4" />
          Filters
        </CardTitle>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilters({
                city: '',
                minRate: '',
                maxRate: '',
                availability: 'all',
              })
            }}
            className="text-xs text-primary hover:text-primary-dark flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* City */}
        <div>
          <label className="text-xs font-medium text-gray-700 uppercase tracking-wider">
            Location
          </label>
          <select
            value={filters.city}
            onChange={(e) => handleChange('city', e.target.value)}
            className="mt-1.5 block w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm bg-neutral-50/50 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all outline-none"
          >
            <option value="">All Cities</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>

        {/* Rate Range */}
        <div>
          <label className="text-xs font-medium text-gray-700 uppercase tracking-wider">
            Rate Range (₦)
          </label>
          <div className="mt-1.5 flex gap-2">
            <Input
              type="number"
              value={filters.minRate}
              onChange={(e) => handleChange('minRate', e.target.value)}
              placeholder="Min"
              className="w-1/2 rounded-xl bg-neutral-50/50 border-neutral-200 focus:bg-white transition-all"
            />
            <Input
              type="number"
              value={filters.maxRate}
              onChange={(e) => handleChange('maxRate', e.target.value)}
              placeholder="Max"
              className="w-1/2 rounded-xl bg-neutral-50/50 border-neutral-200 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Availability */}
        <div>
          <label className="text-xs font-medium text-gray-700 uppercase tracking-wider">
            Availability
          </label>
          <select
            value={filters.availability}
            onChange={(e) => handleChange('availability', e.target.value)}
            className="mt-1.5 block w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm bg-neutral-50/50 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all outline-none"
          >
            <option value="all">All</option>
            <option value="available">Available Now</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        {/* Apply/Reset Buttons */}
        <div className="pt-2 flex gap-2">
          <Button 
            variant="default" 
            className="flex-1 bg-primary hover:bg-primary-dark rounded-xl"
            onClick={() => {
              // Apply filters (they're already applied via state)
            }}
          >
            Apply Filters
          </Button>
          <Button 
            variant="outline" 
            className="flex-1 rounded-xl"
            onClick={() => {
              setFilters({
                city: '',
                minRate: '',
                maxRate: '',
                availability: 'all',
              })
            }}
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

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
  const cities = ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Enugu']

  const handleChange = (key: keyof Filters, value: string) => {
    setFilters({ ...filters, [key]: value })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Filters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700">City</label>
          <select
            value={filters.city}
            onChange={(e) => handleChange('city', e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#AC244D] focus:outline-none"
          >
            <option value="">All Cities</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Rate Range</label>
          <div className="mt-1 flex gap-2">
            <Input
              type="number"
              value={filters.minRate}
              onChange={(e) => handleChange('minRate', e.target.value)}
              placeholder="Min ₦"
              className="w-1/2"
            />
            <Input
              type="number"
              value={filters.maxRate}
              onChange={(e) => handleChange('maxRate', e.target.value)}
              placeholder="Max ₦"
              className="w-1/2"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Availability</label>
          <select
            value={filters.availability}
            onChange={(e) => handleChange('availability', e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#AC244D] focus:outline-none"
          >
            <option value="all">All</option>
            <option value="available">Available Now</option>
            <option value="busy">Busy</option>
          </select>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setFilters({
              city: '',
              minRate: '',
              maxRate: '',
              availability: 'all',
            })
          }}
        >
          Clear Filters
        </Button>
      </CardContent>
    </Card>
  )
}

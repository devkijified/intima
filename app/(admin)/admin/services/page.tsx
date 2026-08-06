'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, Edit, Trash2, Save, X } from 'lucide-react'

interface Service {
  id: string
  name: string
  category: string
  description: string
  is_active: boolean
  created_at: string
}

export default function AdminServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [newService, setNewService] = useState({ name: '', category: '', description: '' })
  const [isAdding, setIsAdding] = useState(false)
  const supabase = createClient()

  // Service categories
  const categories = [
    'Massage & Wellness',
    'Dinner Dates',
    'Travel Companion',
    'Event Companion',
    'Gym Partner',
    'Virtual Companion',
    'Photography',
    'Yoga & Meditation',
    'Business Events',
  ]

  useEffect(() => {
    fetchServices()
  }, [])

  async function fetchServices() {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('category', { ascending: true })
    
    if (!error && data) {
      setServices(data)
    }
    setLoading(false)
  }

  async function addService() {
    if (!newService.name || !newService.category) return

    const { data, error } = await supabase
      .from('services')
      .insert({
        name: newService.name,
        category: newService.category,
        description: newService.description,
        is_active: true,
      })
      .select()
      .single()

    if (!error && data) {
      setServices([...services, data])
      setNewService({ name: '', category: '', description: '' })
      setIsAdding(false)
    }
  }

  async function updateService(id: string, updates: Partial<Service>) {
    const { data, error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (!error && data) {
      setServices(services.map(s => s.id === id ? data : s))
      setEditing(null)
    }
  }

  async function deleteService(id: string) {
    if (!confirm('Delete this service?')) return
    
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id)

    if (!error) {
      setServices(services.filter(s => s.id !== id))
    }
  }

  if (loading) {
    return <div className="text-center py-10">Loading services...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-charcoal">Service Management</h1>
          <p className="text-gray-500 mt-1">Manage service categories and offerings for models</p>
        </div>
        <Button 
          onClick={() => setIsAdding(true)}
          className="bg-primary hover:bg-primary-dark flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Service
        </Button>
      </div>

      {/* Add Service Form */}
      {isAdding && (
        <Card className="mb-8 border-primary/20 border-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>New Service</span>
              <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Service Name *</label>
                <Input
                  value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                  placeholder="e.g. Massage Therapy"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Category *</label>
                <select
                  value={newService.category}
                  onChange={(e) => setNewService({ ...newService, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">Select category...</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
                <Input
                  value={newService.description}
                  onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                  placeholder="Brief description..."
                />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <Button onClick={addService} className="bg-primary hover:bg-primary-dark flex items-center gap-2">
                <Save className="w-4 h-4" />
                Save Service
              </Button>
              <Button variant="outline" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Services Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <Card key={service.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              {editing === service.id ? (
                // Edit Mode
                <div className="space-y-3">
                  <Input
                    value={service.name}
                    onChange={(e) => {
                      const updated = services.map(s => 
                        s.id === service.id ? { ...s, name: e.target.value } : s
                      )
                      setServices(updated)
                    }}
                    placeholder="Name"
                  />
                  <select
                    value={service.category}
                    onChange={(e) => {
                      const updated = services.map(s => 
                        s.id === service.id ? { ...s, category: e.target.value } : s
                      )
                      setServices(updated)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <Input
                    value={service.description || ''}
                    onChange={(e) => {
                      const updated = services.map(s => 
                        s.id === service.id ? { ...s, description: e.target.value } : s
                      )
                      setServices(updated)
                    }}
                    placeholder="Description"
                  />
                  <div className="flex gap-2 pt-2">
                    <Button 
                      size="sm" 
                      onClick={() => updateService(service.id, service)}
                      className="bg-primary hover:bg-primary-dark flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" />
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-charcoal">{service.name}</h3>
                      <p className="text-sm text-gray-500">{service.category}</p>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setEditing(service.id)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4 text-gray-400 hover:text-primary" />
                      </button>
                      <button 
                        onClick={() => deleteService(service.id)}
                        className="p-1 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                  {service.description && (
                    <p className="text-sm text-gray-600 mt-2">{service.description}</p>
                  )}
                  <div className="mt-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      service.is_active 
                        ? 'bg-green-50 text-green-600' 
                        : 'bg-gray-50 text-gray-400'
                    }`}>
                      {service.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {services.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-500">No services added yet</p>
          <p className="text-sm text-gray-400 mt-1">Add your first service using the button above</p>
        </div>
      )}
    </div>
  )
}

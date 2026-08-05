'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Video, AlertCircle } from 'lucide-react'

export default function GoLivePage() {
  const [title, setTitle] = useState('')
  const [pricePerMinute, setPricePerMinute] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleGoLive = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      // Get model profile
      const { data: model, error: modelError } = await supabase
        .from('model_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (modelError) throw new Error('Model profile not found')

      // Create live session
      const { data: session, error: sessionError } = await supabase
        .from('live_sessions')
        .insert({
          model_id: model.id,
          title: title || `${user.email} Live Stream`,
          is_public: isPublic,
          price_per_minute: pricePerMinute ? parseFloat(pricePerMinute) : null,
          status: 'live',
          stream_key: `stream_${Date.now()}`,
          stream_url: `https://stream.intima.com/${model.id}`,
          started_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (sessionError) throw sessionError

      // Redirect to stream page
      router.push(`/models/live/${session.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to start stream')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Video className="h-6 w-6 text-[#AC244D]" />
            Go Live
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGoLive} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stream Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter stream title..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price per Minute (optional)
              </label>
              <Input
                type="number"
                value={pricePerMinute}
                onChange={(e) => setPricePerMinute(e.target.value)}
                placeholder="e.g. 500"
              />
              <p className="text-sm text-gray-500 mt-1">
                Leave empty for free public stream
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Privacy
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={isPublic}
                    onChange={() => setIsPublic(true)}
                    className="text-[#AC244D]"
                  />
                  <span>Public</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!isPublic}
                    onChange={() => setIsPublic(false)}
                    className="text-[#AC244D]"
                  />
                  <span>Private</span>
                </label>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-[#AC244D] hover:bg-[#8F1D40]"
              disabled={loading}
            >
              {loading ? 'Starting Stream...' : '🔴 Go Live Now'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

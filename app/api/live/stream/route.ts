import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get all active live streams
    const { data: streams, error } = await supabase
      .from('live_sessions')
      .select(`
        *,
        model_profiles (
          display_name,
          city,
          profiles (
            avatar_url
          )
        )
      `)
      .eq('status', 'live')
      .order('started_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch streams' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      streams: streams || [],
      count: streams?.length || 0,
    })
  } catch (error) {
    console.error('Error fetching streams:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

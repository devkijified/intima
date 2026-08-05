import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { title, isPublic, pricePerMinute } = body

    // Get user's model profile
    const { data: model, error: modelError } = await supabase
      .from('model_profiles')
      .select('id')
      .eq('user_id', session.user.id)
      .single()

    if (modelError || !model) {
      return NextResponse.json(
        { error: 'Model profile not found' },
        { status: 404 }
      )
    }

    // Create live session
    const { data: sessionData, error: sessionError } = await supabase
      .from('live_sessions')
      .insert({
        model_id: model.id,
        title: title || `${session.user.email} Live Stream`,
        is_public: isPublic ?? true,
        price_per_minute: pricePerMinute || null,
        status: 'live',
        stream_key: `stream_${Date.now()}_${model.id}`,
        stream_url: `https://stream.intima.com/${model.id}`,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (sessionError) {
      return NextResponse.json(
        { error: 'Failed to create live session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      session: sessionData,
    })
  } catch (error) {
    console.error('Error creating live session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

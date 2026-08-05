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
    const { sessionId } = body

    // Verify the user owns this live session
    const { data: sessionData, error: sessionError } = await supabase
      .from('live_sessions')
      .select(`
        *,
        model_profiles (
          user_id
        )
      `)
      .eq('id', sessionId)
      .single()

    if (sessionError || !sessionData) {
      return NextResponse.json(
        { error: 'Live session not found' },
        { status: 404 }
      )
    }

    // Check if user owns this stream
    if (sessionData.model_profiles?.user_id !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Generate a token for the stream (simplified for now)
    // In production, you'd use Mux or similar service
    const token = `token_${Date.now()}_${sessionId}`

    return NextResponse.json({
      success: true,
      token: token,
      streamKey: sessionData.stream_key,
      streamUrl: sessionData.stream_url,
      expiresIn: 3600, // 1 hour
    })
  } catch (error) {
    console.error('Error generating token:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

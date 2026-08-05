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
    const { modelId, amount, message, sessionId } = body

    // Validate required fields
    if (!modelId || !amount) {
      return NextResponse.json(
        { error: 'Model ID and amount are required' },
        { status: 400 }
      )
    }

    if (amount < 100) {
      return NextResponse.json(
        { error: 'Minimum tip is ₦100' },
        { status: 400 }
      )
    }

    // Get client profile
    const { data: client, error: clientError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .single()

    if (clientError) {
      return NextResponse.json(
        { error: 'Client profile not found' },
        { status: 404 }
      )
    }

    // Get model profile
    const { data: model, error: modelError } = await supabase
      .from('model_profiles')
      .select('id, user_id')
      .eq('id', modelId)
      .single()

    if (modelError || !model) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      )
    }

    // Record the tip
    const { data: tipData, error: tipError } = await supabase
      .from('live_tips')
      .insert({
        session_id: sessionId || null,
        client_id: client.id,
        model_id: model.id,
        amount: amount,
        message: message || null,
        status: 'completed',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (tipError) {
      console.error('Error recording tip:', tipError)
      return NextResponse.json(
        { error: 'Failed to process tip' },
        { status: 500 }
      )
    }

    // Update model's total earnings (you'll need to add this field)
    // For now, we'll just return success

    return NextResponse.json({
      success: true,
      tip: tipData,
      message: 'Tip sent successfully!'
    })
  } catch (error) {
    console.error('Error processing tip:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Optional: GET endpoint to get tip history for a model
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

    const { searchParams } = new URL(request.url)
    const modelId = searchParams.get('modelId')

    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID is required' },
        { status: 400 }
      )
    }

    // Get tips for this model
    const { data: tips, error } = await supabase
      .from('live_tips')
      .select(`
        *,
        profiles:client_id (
          full_name,
          avatar_url
        )
      `)
      .eq('model_id', modelId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch tips' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      tips: tips || [],
      total: tips?.length || 0,
    })
  } catch (error) {
    console.error('Error fetching tips:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

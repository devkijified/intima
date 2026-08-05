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

    const formData = await request.formData()
    const file = formData.get('file') as File
    const modelId = formData.get('modelId') as string

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${modelId}/${Date.now()}.${fileExt}`
    const fileBuffer = await file.arrayBuffer()

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('model-photos')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('model-photos')
      .getPublicUrl(fileName)

    // Save to photos table
    const { data: photoData, error: photoError } = await supabase
      .from('photos')
      .insert({
        model_id: modelId,
        url: publicUrl,
        is_verified: false,
        is_primary: false,
      })
      .select()
      .single()

    if (photoError) {
      return NextResponse.json(
        { error: 'Failed to save photo metadata' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      photo: photoData,
      url: publicUrl,
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

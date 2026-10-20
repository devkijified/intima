// Client-side image re-encoding for uploads.
//
// Every photo we accept is redrawn through a canvas before it is
// uploaded. Drawing to a canvas copies only the pixels, so EXIF and
// other embedded metadata (including GPS location) are stripped by
// construction: there is no metadata channel in the output blob.
// Images are scaled down so the longest side is at most 1600px, and
// are never upscaled. PNG inputs stay PNG (so transparency survives);
// everything else becomes JPEG at quality 0.85.
//
// Any failure returns the original file untouched, so a device with a
// quirky image pipeline never loses an upload over this step.

const MAX_SIDE = 1600

async function loadBitmap(file: File): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => { ctx.drawImage(bitmap, 0, 0, w, h) },
      close: () => { bitmap.close() },
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read that image.'))
      el.src = url
    })
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => { ctx.drawImage(img, 0, 0, w, h) },
      close: () => { URL.revokeObjectURL(url) },
    }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

export async function reencodeImage(file: File): Promise<Blob> {
  try {
    if (!file.type.startsWith('image/')) return file
    // Animated GIFs would lose their frames through a canvas; pass them
    // through untouched rather than flattening them to a still.
    if (file.type === 'image/gif') return file

    const source = await loadBitmap(file)
    try {
      if (!source.width || !source.height) return file
      const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height))
      const width = Math.max(1, Math.round(source.width * scale))
      const height = Math.max(1, Math.round(source.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      source.draw(ctx, width, height)

      const isPng = file.type === 'image/png'
      const outType = isPng ? 'image/png' : 'image/jpeg'
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), outType, isPng ? undefined : 0.85)
      })
      return blob ?? file
    } finally {
      source.close()
    }
  } catch {
    return file
  }
}

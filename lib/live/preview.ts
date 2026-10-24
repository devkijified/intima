/**
 * Pre-join live previews.
 *
 * Before a viewer joins a room, the live feed plays a muted
 * preview of it: a real LiveKit connection that only watches.
 * Preview connections mint their token with `preview: true`
 * (see /api/live/token), which gives them an identity ending
 * in this suffix and no publish rights at all. Every other
 * client must treat them as not really in the room: no join
 * announcement, no audience entry, no viewer count. The moment
 * the person taps Watch, the preview drops and a normal join
 * (identity without the suffix) takes its place, announced as
 * usual.
 */
export const PREVIEW_IDENTITY_SUFFIX = '#preview'

export function isPreviewIdentity(identity: string | null | undefined): boolean {
  return !!identity && identity.endsWith(PREVIEW_IDENTITY_SUFFIX)
}

/** Count only the real people among a set of participant identities. */
export function countRealIdentities(identities: Iterable<string>): number {
  let n = 0
  for (const id of identities) {
    if (!isPreviewIdentity(id)) n += 1
  }
  return n
}

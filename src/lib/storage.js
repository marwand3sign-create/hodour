/**
 * Supabase-backed replacement for the Whacka `storage` SDK stub.
 *
 * Files (face snapshots, JSON backups) go into a private bucket — face
 * photos are sensitive, so callers get a long-lived signed URL instead of a
 * public one.
 */
import { supabase } from './_supabaseClient'

const BUCKET = 'hodour-files'
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 // 1 year

export const storage = {
  upload: async (blob, filename) => {
    const { error } = await supabase.storage.from(BUCKET).upload(filename, blob, {
      upsert: true,
      contentType: blob.type || 'application/octet-stream',
    })
    if (error) throw error
    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filename, SIGNED_URL_TTL_SECONDS)
    if (signErr) throw signErr
    return { url: data.signedUrl }
  },
}

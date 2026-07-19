// Supabase Edge Function: cleanup-old-photos
//
// Deletes attendance check-in/check-out photos older than RETENTION_DAYS —
// both the actual file in Storage and the URL column on the attendance row.
// The attendance row itself (hours, wages, GPS, flags) is never touched, and
// neither is employees.reference_photo/reference_embedding (needed
// indefinitely for face-match comparison) — only the two snapshot photo
// columns on old attendance records.
//
// This exists purely to keep the Storage bucket under Supabase's free-tier
// 1GB cap for a small company (~60 employees × 2 photos/day ≈ 90MB/month
// growth without cleanup — see the retention conversation that led here).
//
// Trigger: Supabase Dashboard → Edge Functions → cleanup-old-photos → Cron
// tab → add a monthly schedule. The dashboard's Cron scheduler invokes with
// a valid service-role token automatically, so verify_jwt (default true) is
// satisfied without any secret handling here.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const BUCKET = 'hodour-files'
const RETENTION_DAYS = 60

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Snapshot URLs are signed Storage URLs, e.g.
// https://<ref>.supabase.co/storage/v1/object/sign/hodour-files/face-x-123.jpg?token=...
// — pull out just the object path Storage needs for removal.
function extractPath(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/\/object\/sign\/[^/]+\/([^?]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// The anon key is a validly-signed JWT too, so Supabase's platform-level
// verify_jwt (which only checks the signature) lets it through — without
// this check, anyone holding the public anon key (it ships in the app
// bundle) could invoke this endpoint on demand. Only a token whose own
// `role` claim is 'service_role' may proceed; forging that claim requires
// the project's JWT signing secret, which never leaves server-side code.
function isServiceRoleCaller(req: Request): boolean {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const payload = token.split('.')[1]
  if (!payload) return false
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return claims.role === 'service_role'
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (!isServiceRoleCaller(req)) {
    return json({ error: 'هذه الدالة مخصّصة للتشغيل الآلي فقط' }, 403)
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString()

    const { data: rows, error } = await admin
      .from('attendance')
      .select('id, face_snapshot, out_face_snapshot')
      .lt('check_in', cutoff)
      .or('face_snapshot.not.is.null,out_face_snapshot.not.is.null')
    if (error) return json({ error: error.message }, 500)

    const paths: string[] = []
    for (const r of rows ?? []) {
      const p1 = extractPath(r.face_snapshot)
      const p2 = extractPath(r.out_face_snapshot)
      if (p1) paths.push(p1)
      if (p2) paths.push(p2)
    }

    if (paths.length) {
      const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths)
      if (rmErr) return json({ error: rmErr.message }, 500)
    }

    const ids = (rows ?? []).map((r) => r.id)
    if (ids.length) {
      const { error: updErr } = await admin
        .from('attendance')
        .update({ face_snapshot: null, out_face_snapshot: null })
        .in('id', ids)
      if (updErr) return json({ error: updErr.message }, 500)
    }

    return json({ ok: true, recordsCleared: ids.length, filesDeleted: paths.length, retentionDays: RETENTION_DAYS })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

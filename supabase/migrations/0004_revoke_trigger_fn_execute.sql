-- These are trigger-only functions (reference NEW/OLD, error if called
-- directly). Trigger firing doesn't need EXECUTE grants, so revoke the
-- default PUBLIC grant the Supabase security linter flagged — closes the
-- PostgREST RPC surface (/rest/v1/rpc/...) without touching trigger behavior.
revoke execute on function enforce_employee_self_update() from public, anon, authenticated;
revoke execute on function enforce_attendance_insert() from public, anon, authenticated;
revoke execute on function enforce_attendance_update() from public, anon, authenticated;
revoke execute on function evaluate_attendance_notifications() from public, anon, authenticated;

-- is_manager() IS meant to be called (from RLS policies, evaluated as the
-- querying role) — just narrow it to authenticated, not the world.
revoke execute on function is_manager() from public;
grant execute on function is_manager() to authenticated;

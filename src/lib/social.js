/**
 * Replacement for the Whacka `social` SDK stub. Hodour is single-tenant per
 * Supabase project, and ownership is already implicit via the manually
 * bootstrapped `employees.role = 'owner'` row (see supabase/README.md) — so
 * there's nothing left to "claim" here.
 */
export const social = {
  claimGroupOwnership: async () => {},
}

-- Share-to-token read hardening, phase 2 of 2. Drops the two open anon-read
-- policies that phase 1 (20261003000001_share_read_functions.sql) replaced
-- with token-scoped SECURITY DEFINER functions. Both policies were
-- `qual = true` for role {public} — any anon or authenticated caller could
-- enumerate every row in these tables, not just the one they hold a token
-- for. Deliberately NOT applied in the same migration as phase 1: the
-- client call sites (data.ts) needed to be live in production first, since
-- preview and production share this database. Confirmed live on main
-- (commit 85a30ba) before this migration was written.
--
-- No other policy on either table is touched. Owner-write policies and the
-- SECURITY DEFINER functions' internal table access (which bypasses RLS
-- entirely, by definition) are unaffected by dropping these two.

drop policy recipe_shares_select_anon on public.recipe_shares;
drop policy grocery_list_shares_select_anon on public.grocery_list_shares;

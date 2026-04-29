alter table public.exports
  add column if not exists metadata jsonb default '{}';

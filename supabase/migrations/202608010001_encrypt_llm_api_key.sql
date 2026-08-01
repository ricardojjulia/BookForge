-- Encrypt user_settings.llm_api_key at rest using Supabase Vault instead of
-- storing cloud provider API keys (OpenAI/Anthropic/Google/OpenRouter) as
-- plaintext. The plaintext column stays as a write-only bridge: a trigger
-- intercepts any write to it, moves the value into vault.secrets, and nulls
-- the column back out before it's ever actually persisted in cleartext.
--
-- Semantics for the plaintext column on write:
--   - non-empty string  -> create-or-update the vault secret, store its id
--   - empty string ''   -> explicit "clear the saved key" (deletes the secret)
--   - column omitted from the UPDATE's SET list entirely (the common case:
--     saving unrelated settings) -> NEW.llm_api_key equals OLD.llm_api_key,
--     which is already NULL after the first save, so nothing happens and
--     the existing key is left untouched.
--
-- See src/lib/lmstudio/settings.ts (read side, via get_llm_api_key()) and
-- src/components/settings/settings-form.tsx (write side — only sends
-- llm_api_key when the user actually edits or explicitly clears the field).

alter table public.user_settings
  add column if not exists llm_api_key_secret_id uuid references vault.secrets(id) on delete set null;

comment on column public.user_settings.llm_api_key_secret_id is
  'Vault-encrypted storage for the cloud LLM provider API key. llm_api_key itself is write-only — see sync_llm_api_key_to_vault trigger.';

-- One-time backfill: move any existing plaintext keys into Vault.
do $$
declare
  row_record record;
  new_secret_id uuid;
begin
  for row_record in
    select user_id, llm_api_key
    from public.user_settings
    where llm_api_key is not null and llm_api_key <> ''
  loop
    new_secret_id := vault.create_secret(
      row_record.llm_api_key,
      'user_settings.llm_api_key.' || row_record.user_id::text,
      'LLM provider API key for user ' || row_record.user_id::text
    );
    update public.user_settings
      set llm_api_key_secret_id = new_secret_id, llm_api_key = null
      where user_id = row_record.user_id;
  end loop;
end $$;

-- SECURITY DEFINER: runs with the privileges of the function owner (the
-- migration-running role, which has vault access), not the calling
-- authenticated user — vault.create_secret/update_secret aren't granted to
-- anon/authenticated directly, by design.
create or replace function public.sync_llm_api_key_to_vault()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  existing_secret_id uuid;
begin
  if new.llm_api_key is null then
    -- Column not included in this write, or explicitly set to NULL — either
    -- way, leave any existing vaulted key untouched.
    return new;
  end if;

  -- Look up any existing vaulted secret for this user directly, rather than
  -- trusting NEW.llm_api_key_secret_id. Under an upsert (INSERT ... ON
  -- CONFLICT DO UPDATE, which is what the settings form's .upsert() call
  -- generates), Postgres fires the BEFORE INSERT version of this trigger
  -- first, with NEW reflecting the fresh insert row (this column unset) —
  -- even when a conflicting row with an existing secret already exists. A
  -- direct lookup sidesteps that ambiguity entirely.
  select llm_api_key_secret_id into existing_secret_id
  from public.user_settings
  where user_id = new.user_id;

  if new.llm_api_key = '' then
    -- Explicit clear.
    if existing_secret_id is not null then
      delete from vault.secrets where id = existing_secret_id;
    end if;
    new.llm_api_key_secret_id := null;
    new.llm_api_key := null;
    return new;
  end if;

  if existing_secret_id is not null then
    perform vault.update_secret(existing_secret_id, new.llm_api_key);
    new.llm_api_key_secret_id := existing_secret_id;
  else
    new.llm_api_key_secret_id := vault.create_secret(
      new.llm_api_key,
      'user_settings.llm_api_key.' || new.user_id::text,
      'LLM provider API key for user ' || new.user_id::text
    );
  end if;

  new.llm_api_key := null;
  return new;
end;
$$;

drop trigger if exists sync_llm_api_key_to_vault_trigger on public.user_settings;
create trigger sync_llm_api_key_to_vault_trigger
  before insert or update on public.user_settings
  for each row
  execute function public.sync_llm_api_key_to_vault();

-- Cleanup: if a user_settings row is deleted, don't leave its vaulted secret
-- (a real, live provider API key) lingering forever.
create or replace function public.cleanup_llm_api_key_vault_secret()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if old.llm_api_key_secret_id is not null then
    delete from vault.secrets where id = old.llm_api_key_secret_id;
  end if;
  return old;
end;
$$;

drop trigger if exists cleanup_llm_api_key_vault_secret_trigger on public.user_settings;
create trigger cleanup_llm_api_key_vault_secret_trigger
  after delete on public.user_settings
  for each row
  execute function public.cleanup_llm_api_key_vault_secret();

-- Read-side accessor: SECURITY DEFINER so it can read vault.decrypted_secrets
-- (not granted to authenticated directly), but self-enforces the same
-- "only your own row" restriction RLS would otherwise provide.
create or replace function public.get_llm_api_key(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  result text;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to read this API key.';
  end if;

  select vs.decrypted_secret into result
  from public.user_settings us
  join vault.decrypted_secrets vs on vs.id = us.llm_api_key_secret_id
  where us.user_id = p_user_id;

  return result;
end;
$$;

grant execute on function public.get_llm_api_key(uuid) to authenticated;

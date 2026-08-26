-- Second vaulted secret on user_settings: an OpenRouter Management/
-- Provisioning API key, used server-side only to create/update/disable a
-- scoped API key on the user's own OpenRouter account (the "BYOT" model --
-- see src/lib/openrouter/management.ts). Modeled 1:1 on
-- 202608010001_encrypt_llm_api_key.sql's llm_api_key vaulting pattern.
--
-- openrouter_scoped_key_hash is NOT a secret -- it's OpenRouter's own
-- /api/v1/keys/{hash} identifier for the scoped key this management key
-- created. Non-null here doubles as the flag "this account is on the
-- BookForge-managed OpenRouter path" -- read by src/lib/lmstudio/settings.ts
-- to set StandardLlmSettings.isBookForgeManagedKey, which src/lib/lmstudio/
-- client.ts uses to skip the internal credit-reservation gate (OpenRouter's
-- own key limit is the real enforcer for these users, not the ai_credit_ledger).

alter table public.user_settings
  add column if not exists openrouter_management_key_secret_id uuid references vault.secrets(id) on delete set null;

alter table public.user_settings
  add column if not exists openrouter_scoped_key_hash text;

comment on column public.user_settings.openrouter_management_key_secret_id is
  'Vault-encrypted OpenRouter Management/Provisioning API key -- server-side only, used to create/update/disable the scoped key referenced by openrouter_scoped_key_hash. See sync_openrouter_management_key_to_vault trigger.';
comment on column public.user_settings.openrouter_scoped_key_hash is
  'OpenRouter''s identifier (GET/PATCH/DELETE /api/v1/keys/{hash}) for the BookForge-managed scoped key. Non-null => llm_api_key holds that scoped key, not a user-pasted personal key, and per-call credit reservation is skipped -- see src/lib/lmstudio/client.ts.';

-- Write-only plaintext bridge column, same semantics as llm_api_key's:
--   non-empty string -> create-or-update the vault secret, store its id
--   empty string ''  -> explicit "clear the saved key" (deletes the secret)
--   omitted from the UPDATE's SET list -> leave any existing key untouched
alter table public.user_settings
  add column if not exists openrouter_management_key text;

create or replace function public.sync_openrouter_management_key_to_vault()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  existing_secret_id uuid;
begin
  if new.openrouter_management_key is null then
    return new;
  end if;

  -- Direct lookup rather than trusting NEW.openrouter_management_key_secret_id
  -- -- same upsert-ordering reasoning as sync_llm_api_key_to_vault().
  select openrouter_management_key_secret_id into existing_secret_id
  from public.user_settings
  where user_id = new.user_id;

  if new.openrouter_management_key = '' then
    if existing_secret_id is not null then
      delete from vault.secrets where id = existing_secret_id;
    end if;
    new.openrouter_management_key_secret_id := null;
    new.openrouter_management_key := null;
    return new;
  end if;

  if existing_secret_id is not null then
    perform vault.update_secret(existing_secret_id, new.openrouter_management_key);
    new.openrouter_management_key_secret_id := existing_secret_id;
  else
    new.openrouter_management_key_secret_id := vault.create_secret(
      new.openrouter_management_key,
      'user_settings.openrouter_management_key.' || new.user_id::text,
      'OpenRouter Management API key for user ' || new.user_id::text
    );
  end if;

  new.openrouter_management_key := null;
  return new;
end;
$$;

drop trigger if exists sync_openrouter_management_key_to_vault_trigger on public.user_settings;
create trigger sync_openrouter_management_key_to_vault_trigger
  before insert or update on public.user_settings
  for each row
  execute function public.sync_openrouter_management_key_to_vault();

create or replace function public.cleanup_openrouter_management_key_vault_secret()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if old.openrouter_management_key_secret_id is not null then
    delete from vault.secrets where id = old.openrouter_management_key_secret_id;
  end if;
  return old;
end;
$$;

drop trigger if exists cleanup_openrouter_management_key_vault_secret_trigger on public.user_settings;
create trigger cleanup_openrouter_management_key_vault_secret_trigger
  after delete on public.user_settings
  for each row
  execute function public.cleanup_openrouter_management_key_vault_secret();

-- Read-side accessor. Unlike get_llm_api_key(), this must also be callable
-- with no end-user JWT -- the billing webhook handler (Stripe events) reads
-- this via the service-role admin client to sync the scoped key's limit on
-- renewal/upgrade/downgrade/cancellation.
create or replace function public.get_openrouter_management_key(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  result text;
begin
  -- Both sides use IS DISTINCT FROM (not <>/=) deliberately: a plain <>
  -- against a NULL auth.role()/auth.uid() (e.g. no role claim present)
  -- evaluates to NULL, not TRUE, which Postgres treats as "don't raise" in
  -- an IF -- silently allowing an unauthorized read instead of denying it.
  -- IS DISTINCT FROM is NULL-safe: NULL is treated as different from any
  -- non-null value, so an absent/malformed claim correctly denies access.
  if auth.uid() is distinct from p_user_id and auth.role() is distinct from 'service_role' then
    raise exception 'Not authorized to read this API key.';
  end if;

  select vs.decrypted_secret into result
  from public.user_settings us
  join vault.decrypted_secrets vs on vs.id = us.openrouter_management_key_secret_id
  where us.user_id = p_user_id;

  return result;
end;
$$;

grant execute on function public.get_openrouter_management_key(uuid) to authenticated, service_role;

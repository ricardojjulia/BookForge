-- collaborator_invites.token's default called encode(..., 'base64url'), which
-- isn't a real encoding for Postgres's encode() (only base64/hex/escape are).
-- Every insert into this table has been erroring with 22023
-- "unrecognized encoding" since the table was created -- confirmed live via
-- production logs, not guessed. Rebuild the same URL-safe base64url output by
-- hand from a real base64 encode (translate the two non-URL-safe characters,
-- strip padding), rather than switching to a different token format.
alter table public.collaborator_invites
  alter column token set default translate(
    encode(extensions.gen_random_bytes(24), 'base64'),
    '+/=',
    '-_'
  );

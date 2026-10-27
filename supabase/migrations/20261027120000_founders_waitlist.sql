-- M2-AP10: Founders waitlist with double opt-in (docs/ARCHITECTURE.md, "Founders-Warteliste").
--
-- Access model
-- - Both tables have RLS enabled and NO policies, and every table privilege is
--   revoked from anon, authenticated and service_role. Nobody reads or writes
--   rows directly through the Data API.
-- - The web app's server (Cloudflare Worker, service role key) only calls the
--   SECURITY DEFINER functions below, which are executable by service_role
--   only. They validate their input and do one narrow thing each.
-- - waitlist_confirmed_count() returns a single number and is the only
--   function anon and authenticated may execute (public counter).
--
-- Privacy (nDSG/DSGVO)
-- - No raw IP address is stored. The per-IP limit uses an HMAC of the IP
--   (keyed with a server secret and the current day, computed in the Worker),
--   kept for at most one day in waitlist_rate_limits.
-- - Only SHA-256 hashes of the confirmation and unsubscribe tokens are stored.
-- - Unsubscribing erases the e-mail address; the row stays as an anonymous
--   tally. Unconfirmed sign-ups are deleted 30 days after the last mail.
--
-- All functions pin `search_path = ''` and use fully qualified names.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased in the app and checked here; null once unsubscribed (erased).
  email text unique
    constraint waitlist_email_format check (
      email = lower(email)
      and char_length(email) between 3 and 254
      and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),
  locale text not null constraint waitlist_locale check (locale in ('de', 'en', 'fr', 'it')),
  status text not null default 'pending'
    constraint waitlist_status check (status in ('pending', 'confirmed', 'unsubscribed')),
  -- Version of the consent text the person agreed to (app constant).
  consent_version text not null
    constraint waitlist_consent_version check (consent_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  -- SHA-256 (hex) of the one-time confirmation token; null after use.
  confirm_token_hash text unique
    constraint waitlist_confirm_hash check (confirm_token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz,
  -- SHA-256 (hex) of the unsubscribe token from the latest mail.
  unsubscribe_token_hash text unique
    constraint waitlist_unsubscribe_hash check (unsubscribe_token_hash ~ '^[0-9a-f]{64}$'),
  -- Confirmation mails sent for this row (cap against mail bombing) and when.
  send_count integer not null default 0 constraint waitlist_send_count check (send_count >= 0),
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  -- Unsubscribed rows hold no e-mail address, all others must.
  constraint waitlist_email_erased check ((status = 'unsubscribed') = (email is null))
);

comment on table public.waitlist_signups is
  'Founders waitlist (double opt-in). Server-only access via SECURITY DEFINER functions.';

create index waitlist_signups_status_idx on public.waitlist_signups (status);
create index waitlist_signups_pending_sent_idx on public.waitlist_signups (last_sent_at)
  where status = 'pending';

create table public.waitlist_rate_limits (
  -- HMAC-SHA-256 (hex) of the client IP, keyed per day by the server.
  key_hash text not null constraint waitlist_rate_key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key_hash, window_start)
);

comment on table public.waitlist_rate_limits is
  'Hourly sign-up counters per hashed IP; rows older than one day are deleted.';

alter table public.waitlist_signups enable row level security;
alter table public.waitlist_rate_limits enable row level security;

-- Supabase grants table privileges to these roles by default; take them back.
revoke all on table public.waitlist_signups from public, anon, authenticated, service_role;
revoke all on table public.waitlist_rate_limits from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public counter
-- ---------------------------------------------------------------------------

create function public.waitlist_confirmed_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.waitlist_signups where status = 'confirmed';
$$;

comment on function public.waitlist_confirmed_count() is
  'Number of confirmed waitlist sign-ups. The only waitlist data anon may read.';

-- ---------------------------------------------------------------------------
-- Sign-up request (server only)
-- ---------------------------------------------------------------------------

-- Returns 'send' when the caller must mail the confirmation link for the
-- given token hashes, 'skip' when no mail goes out (already confirmed,
-- cooldown, send cap) and 'rate_limited' when the hashed IP exceeded its
-- hourly budget. The HTTP response is the same for 'send' and 'skip', so it
-- never reveals whether an address is on the list.
create function public.waitlist_request_signup(
  p_email text,
  p_locale text,
  p_consent_version text,
  p_confirm_token_hash text,
  p_unsubscribe_token_hash text,
  p_rate_key_hash text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Keep in sync with apps/web/lib/waitlist/limits.ts.
  c_ip_limit_per_hour constant integer := 10;
  c_resend_cooldown constant interval := interval '10 minutes';
  c_max_sends constant integer := 5;
  c_token_ttl constant interval := interval '48 hours';
  c_pending_retention constant interval := interval '30 days';
  v_email text := lower(trim(p_email));
  v_hits integer;
  v_row public.waitlist_signups%rowtype;
begin
  if p_confirm_token_hash !~ '^[0-9a-f]{64}$' or p_unsubscribe_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;

  if p_rate_key_hash is not null then
    delete from public.waitlist_rate_limits where window_start < now() - interval '1 day';
    insert into public.waitlist_rate_limits as r (key_hash, window_start, hits)
      values (p_rate_key_hash, date_trunc('hour', now()), 1)
      on conflict (key_hash, window_start) do update set hits = r.hits + 1
      returning r.hits into v_hits;
    if v_hits > c_ip_limit_per_hour then
      return 'rate_limited';
    end if;
  end if;

  -- Housekeeping: unconfirmed sign-ups expire 30 days after the last mail.
  delete from public.waitlist_signups
    where status = 'pending' and last_sent_at < now() - c_pending_retention;

  select * into v_row from public.waitlist_signups where email = v_email for update;

  if not found then
    insert into public.waitlist_signups (
      email, locale, consent_version, confirm_token_hash, token_expires_at,
      unsubscribe_token_hash, send_count, last_sent_at
    ) values (
      v_email, p_locale, p_consent_version, p_confirm_token_hash, now() + c_token_ttl,
      p_unsubscribe_token_hash, 1, now()
    )
    on conflict (email) do nothing;
    -- A concurrent request inserted the same address first: no second mail.
    return case when found then 'send' else 'skip' end;
  end if;

  if v_row.status = 'confirmed' then
    return 'skip';
  end if;

  if v_row.send_count >= c_max_sends
     or (v_row.last_sent_at is not null and v_row.last_sent_at > now() - c_resend_cooldown) then
    return 'skip';
  end if;

  update public.waitlist_signups set
    locale = p_locale,
    consent_version = p_consent_version,
    confirm_token_hash = p_confirm_token_hash,
    token_expires_at = now() + c_token_ttl,
    unsubscribe_token_hash = p_unsubscribe_token_hash,
    send_count = send_count + 1,
    last_sent_at = now()
  where id = v_row.id;
  return 'send';
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirmation and unsubscribe (server only)
-- ---------------------------------------------------------------------------

-- One-time confirmation: 'confirmed', or 'invalid' for unknown, used or
-- expired tokens.
create function public.waitlist_confirm(p_token_hash text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.waitlist_signups set
    status = 'confirmed',
    confirmed_at = now(),
    confirm_token_hash = null,
    token_expires_at = null
  where confirm_token_hash = p_token_hash
    and status = 'pending'
    and token_expires_at > now();
  return case when found then 'confirmed' else 'invalid' end;
end;
$$;

-- Unsubscribe erases the address and all tokens: 'unsubscribed' or 'invalid'.
create function public.waitlist_unsubscribe(p_token_hash text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.waitlist_signups set
    status = 'unsubscribed',
    email = null,
    confirm_token_hash = null,
    token_expires_at = null,
    unsubscribe_token_hash = null,
    unsubscribed_at = now()
  where unsubscribe_token_hash = p_token_hash
    and status <> 'unsubscribed';
  return case when found then 'unsubscribed' else 'invalid' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: PUBLIC holds EXECUTE by default; Supabase also grants
-- it to anon/authenticated/service_role. Revoke everything, then grant back.
-- ---------------------------------------------------------------------------

revoke all on function public.waitlist_confirmed_count() from public, anon, authenticated, service_role;
revoke all on function public.waitlist_request_signup(text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.waitlist_confirm(text) from public, anon, authenticated, service_role;
revoke all on function public.waitlist_unsubscribe(text) from public, anon, authenticated, service_role;

grant execute on function public.waitlist_confirmed_count() to anon, authenticated, service_role;
grant execute on function public.waitlist_request_signup(text, text, text, text, text, text)
  to service_role;
grant execute on function public.waitlist_confirm(text) to service_role;
grant execute on function public.waitlist_unsubscribe(text) to service_role;

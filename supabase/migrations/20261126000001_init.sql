-- Gentrep Sites: first migration. Multi-tenant from the first table (playbook: 11 - Multi-Tenant Pattern).
--
-- Rules this file follows:
--   * The database decides the tenant (app.my_tenant()), never the request.
--   * Every table has RLS on. Default grants are revoked, then granted back per table.
--   * State changes go through SQL functions. Direct writes from clients are not granted.
--   * Every definer function checks its caller and sets search_path = ''.
--   * Data class is written next to each personal column (playbook: 01 - Security Baseline).
--
-- New function in a later migration: revoke execute from public, anon, authenticated, then grant it.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- Supabase grants everything to anon/authenticated by default. Start from nothing.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ============================================================================
-- Tables
-- ============================================================================

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug !~ '--'),
  constraint tenants_status check (status in ('active', 'suspended')),
  constraint tenants_name_len check (char_length(btrim(name)) between 2 and 80)
);
create unique index tenants_slug_key on public.tenants (slug);
create index tenants_created_at on public.tenants (created_at desc);

-- One admin per tenant for now: the unique (tenant_id) is the only thing to drop to allow staff later.
create table public.tenant_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null, -- class: personal
  created_at timestamptz not null default now(),
  constraint tenant_admins_one_per_tenant unique (tenant_id),
  constraint tenant_admins_name_len check (char_length(btrim(full_name)) between 2 and 100)
);

create table public.site_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  brand_color text not null default '#0068d0',
  logo_path text,
  favicon_path text,
  hero_image_path text,
  hero_headline text,
  hero_text text,
  contact_email text,   -- class: not personal (a business contact shown on a public page)
  contact_phone text,   -- same
  contact_address text, -- same
  facebook_url text,
  instagram_url text,
  tiktok_url text,
  youtube_url text,
  footer_blurb text,
  seo_title text,
  seo_description text,
  show_features boolean not null default true,
  show_join boolean not null default true,
  show_faq boolean not null default false,
  show_contact boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint site_brand_color check (brand_color ~ '^#[0-9a-f]{6}$'),
  constraint site_logo_path check (logo_path is null or logo_path ~ ('^' || tenant_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$')),
  constraint site_favicon_path check (favicon_path is null or favicon_path ~ ('^' || tenant_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$')),
  constraint site_hero_image_path check (hero_image_path is null or hero_image_path ~ ('^' || tenant_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$')),
  constraint site_hero_headline check (char_length(hero_headline) <= 80),
  constraint site_hero_text check (char_length(hero_text) <= 300),
  constraint site_contact_email check (contact_email is null or (char_length(contact_email) <= 120 and contact_email ~ '^[^@[:space:]?&%/]+@[^@[:space:]?&%/]+\.[^@[:space:]?&%/]+$')),
  constraint site_contact_phone check (contact_phone is null or contact_phone ~ '^[-0-9+() ]{5,30}$'),
  constraint site_contact_address check (char_length(contact_address) <= 200),
  constraint site_facebook check (facebook_url is null or (char_length(facebook_url) <= 300 and facebook_url ~* '^https?://[^[:space:]]+$')),
  constraint site_instagram check (instagram_url is null or (char_length(instagram_url) <= 300 and instagram_url ~* '^https?://[^[:space:]]+$')),
  constraint site_tiktok check (tiktok_url is null or (char_length(tiktok_url) <= 300 and tiktok_url ~* '^https?://[^[:space:]]+$')),
  constraint site_youtube check (youtube_url is null or (char_length(youtube_url) <= 300 and youtube_url ~* '^https?://[^[:space:]]+$')),
  constraint site_footer_blurb check (char_length(footer_blurb) <= 300),
  constraint site_seo_title check (char_length(seo_title) <= 70),
  constraint site_seo_description check (char_length(seo_description) <= 160)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null,  -- class: personal
  email text not null,      -- class: personal, stored lower case
  mobile text not null,     -- class: personal, +639XXXXXXXXX
  city text not null,       -- class: personal
  member_type text not null default 'member',
  consent_notice_version text not null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint registrations_name_len check (char_length(full_name) between 2 and 100),
  constraint registrations_email check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint registrations_mobile check (mobile ~ '^\+639[0-9]{9}$'),
  constraint registrations_city_len check (char_length(city) between 2 and 80),
  constraint registrations_type check (member_type in ('member')),
  constraint registrations_notice_len check (char_length(consent_notice_version) between 1 and 40)
);
-- Unique per tenant, never global: a global rule would tell tenant A that tenant B has this email.
create unique index registrations_tenant_email_key on public.registrations (tenant_id, email);
create index registrations_tenant_created on public.registrations (tenant_id, created_at desc, id);

-- No personal data in here: ids and counts only. tenant_id has no foreign key so the log outlives a tenant.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_kind text not null,
  tenant_id uuid,
  action text not null,
  target_id uuid,
  detail jsonb not null default '{}',
  constraint audit_actor_kind check (actor_kind in ('tenant_admin', 'platform_admin', 'system'))
);
create index audit_log_tenant_at on public.audit_log (tenant_id, at desc);
create index audit_log_at on public.audit_log (at desc);

-- Platform staff see no tenant registrations by default. A grant needs a reason, lasts one hour, and is logged.
create table public.support_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  admin_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint support_reason_len check (char_length(btrim(reason)) between 10 and 300)
);
create index support_access_lookup on public.support_access (tenant_id, admin_id, expires_at desc);

create table public.reserved_slugs (
  slug text primary key,
  constraint reserved_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$')
);

create table app.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.tenants enable row level security;
alter table public.tenant_admins enable row level security;
alter table public.site_settings enable row level security;
alter table public.registrations enable row level security;
alter table public.audit_log enable row level security;
alter table public.support_access enable row level security;
alter table public.reserved_slugs enable row level security;
alter table app.platform_admins enable row level security;

insert into public.reserved_slugs (slug) values
  ('www'), ('api'), ('admin'), ('app'), ('mail'), ('email'), ('smtp'), ('imap'), ('ftp'), ('staging'), ('dev'), ('test'),
  ('support'), ('help'), ('status'), ('blog'), ('docs'), ('login'), ('logout'), ('signin'), ('signup'), ('register'),
  ('registration'), ('account'), ('dashboard'), ('static'), ('assets'), ('cdn'), ('root'), ('gentrep'), ('billing'),
  ('secure'), ('security'), ('privacy'), ('terms'), ('about'), ('contact'), ('auth'), ('ns1'), ('ns2'), ('webmail'),
  ('bdo'), ('bpi'), ('metrobank'), ('landbank'), ('unionbank'), ('securitybank'), ('pnb'), ('rcbc'), ('chinabank'),
  ('gcash'), ('maya'), ('paymaya'), ('paypal'), ('google'), ('facebook'), ('instagram'), ('tiktok'), ('microsoft'),
  ('apple'), ('amazon'), ('gov'), ('doh'), ('bir'), ('sss'), ('philhealth'), ('pagibig'), ('nbi'), ('pnp'), ('dti'),
  ('sec'), ('bsp'), ('npc'), ('gutguard');

-- ============================================================================
-- Helpers (private schema; the REST API does not expose "app")
-- ============================================================================

create function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.platform_admins p where p.user_id = (select auth.uid()))
     and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
$$;

-- The caller's active tenant. Null for a suspended tenant, so a suspended admin gets nothing from RLS.
create function app.my_tenant() returns uuid
language sql stable security definer set search_path = '' as $$
  select a.tenant_id
  from public.tenant_admins a join public.tenants t on t.id = a.tenant_id
  where a.user_id = (select auth.uid()) and t.status = 'active'
$$;

create function app.has_support(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin() and exists (
    select 1 from public.support_access s
    where s.tenant_id = p_tenant and s.admin_id = (select auth.uid()) and s.expires_at > now())
$$;

create function app.require_platform() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode = '42501'; end if;
  if not exists (select 1 from app.platform_admins where user_id = auth.uid()) then
    raise exception 'You do not have access to that.' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
end $$;

-- Returns the tenant a tenant-admin call acts on. Own tenant only, and only while it is active.
create function app.require_tenant() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode = '42501'; end if;
  v := app.my_tenant();
  if v is null then
    if exists (select 1 from public.tenant_admins a join public.tenants t on t.id = a.tenant_id where a.user_id = auth.uid() and t.status = 'suspended') then
      raise exception 'site_suspended' using errcode = '42501';
    end if;
    raise exception 'You do not have access to that.' using errcode = '42501';
  end if;
  return v;
end $$;

create function app.slug_problem(p_slug text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' or p_slug ~ '--' then 'invalid'
    when exists (select 1 from public.reserved_slugs r where r.slug = p_slug) then 'reserved'
    when exists (select 1 from public.tenants t where t.slug = p_slug) then 'taken'
  end
$$;

create function app.log(p_tenant uuid, p_kind text, p_action text, p_target uuid, p_detail jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (tenant_id, actor_id, actor_kind, action, target_id, detail)
  values (p_tenant, auth.uid(), p_kind, p_action, p_target, coalesce(p_detail, '{}'::jsonb))
$$;

create function app.append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function app.append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function app.append_only();

create function app.like_escape(p text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- ============================================================================
-- Public functions: the only things anon may call (get_site, slug_status, register_member)
-- ============================================================================

create function public.get_site(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when t.status = 'active' then jsonb_build_object(
      'status', 'active', 'slug', t.slug, 'name', t.name,
      'settings', to_jsonb(s) - 'tenant_id' - 'updated_at')
    else jsonb_build_object('status', t.status)
  end
  from public.tenants t join public.site_settings s on s.tenant_id = t.id
  where t.slug = p_slug
$$;

create function public.slug_status(p_slug text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(app.slug_problem(p_slug), 'available')
$$;

-- Always succeeds the same way for a duplicate email, so the page cannot be used to test who is registered.
create function public.register_member(
  p_slug text, p_full_name text, p_email text, p_mobile text, p_city text, p_notice_version text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select id into v_tenant from public.tenants where slug = p_slug and status = 'active';
  if v_tenant is null then raise exception 'This site is not taking registrations.'; end if;
  if (select count(*) from public.registrations r where r.tenant_id = v_tenant and r.created_at > now() - interval '1 hour') >= 500 then
    raise exception 'Registrations are busy right now. Try again later.';
  end if;
  insert into public.registrations (tenant_id, full_name, email, mobile, city, consent_notice_version)
  values (v_tenant, btrim(p_full_name), lower(btrim(p_email)), p_mobile, btrim(p_city), p_notice_version)
  on conflict (tenant_id, email) do nothing;
end $$;

-- ============================================================================
-- Signed-in functions
-- ============================================================================

create function public.whoami() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in to continue.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'user_id', v_uid,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'platform_admin', exists (select 1 from app.platform_admins p where p.user_id = v_uid),
    'tenant', (select jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status)
               from public.tenant_admins a join public.tenants t on t.id = a.tenant_id where a.user_id = v_uid),
    'pending', (select u.raw_app_meta_data -> 'pending_tenant' from auth.users u
                where u.id = v_uid and u.email_confirmed_at is not null)
  );
end $$;

-- Opens the site a confirmed email was waiting for. The pending name and slug sit in app_metadata,
-- which only the service role can write, so a user cannot pick another tenant's name or invent a role.
create function public.activate_my_tenant(p_slug text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_confirmed timestamptz;
  v_meta jsonb;
  v_pending jsonb;
  v_existing text;
  v_slug text;
  v_tenant uuid;
begin
  if v_uid is null then raise exception 'Sign in to continue.' using errcode = '42501'; end if;
  select u.email_confirmed_at, u.raw_app_meta_data into v_confirmed, v_meta from auth.users u where u.id = v_uid;
  if v_confirmed is null then raise exception 'Confirm your email first.' using errcode = '42501'; end if;

  select t.slug into v_existing from public.tenant_admins a join public.tenants t on t.id = a.tenant_id where a.user_id = v_uid;
  if found then return jsonb_build_object('slug', v_existing); end if;

  v_pending := v_meta -> 'pending_tenant';
  if v_pending is null then raise exception 'There is no site waiting to open for this account.'; end if;
  v_slug := coalesce(nullif(btrim(p_slug), ''), v_pending ->> 'slug');
  case app.slug_problem(v_slug)
    when 'invalid' then raise exception 'Use 3 to 40 letters, numbers or hyphens.';
    when 'reserved' then raise exception 'That address is not available. Choose another.';
    when 'taken' then raise exception 'That address is taken. Choose another.';
    else null;
  end case;
  if (select count(*) from public.tenants where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Sign-ups are busy right now. Try again later.';
  end if;

  insert into public.tenants (slug, name) values (v_slug, btrim(v_pending ->> 'name')) returning id into v_tenant;
  insert into public.tenant_admins (user_id, tenant_id, full_name) values (v_uid, v_tenant, btrim(v_pending ->> 'admin_name'));
  insert into public.site_settings (tenant_id) values (v_tenant);
  perform app.log(v_tenant, 'tenant_admin', 'tenant_created', v_tenant, '{}');
  return jsonb_build_object('slug', v_slug);
exception when unique_violation then
  raise exception 'That address was just taken. Choose another.';
end $$;

-- p_tenant null = the caller's own tenant. A platform admin names another tenant explicitly.
create function public.get_admin_site(p_tenant uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  if p_tenant is not null and p_tenant is distinct from app.my_tenant() then
    perform app.require_platform();
    v_tenant := p_tenant;
  else
    v_tenant := app.require_tenant();
  end if;
  return (select jsonb_build_object(
      'tenant', jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status),
      'settings', to_jsonb(s) - 'tenant_id' - 'updated_at')
    from public.tenants t join public.site_settings s on s.tenant_id = t.id where t.id = v_tenant);
end $$;

-- Whole-form save: every field is replaced, so the editor always sends the full state.
create function public.save_site(p_tenant uuid, p_site jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  if p_tenant is not null and p_tenant is distinct from app.my_tenant() then
    perform app.require_platform();
    v_tenant := p_tenant;
  else
    v_tenant := app.require_tenant();
  end if;
  update public.site_settings s set
    brand_color = coalesce(nullif(btrim(p_site ->> 'brand_color'), ''), s.brand_color),
    logo_path = nullif(btrim(p_site ->> 'logo_path'), ''),
    favicon_path = nullif(btrim(p_site ->> 'favicon_path'), ''),
    hero_image_path = nullif(btrim(p_site ->> 'hero_image_path'), ''),
    hero_headline = nullif(btrim(p_site ->> 'hero_headline'), ''),
    hero_text = nullif(btrim(p_site ->> 'hero_text'), ''),
    contact_email = nullif(btrim(p_site ->> 'contact_email'), ''),
    contact_phone = nullif(btrim(p_site ->> 'contact_phone'), ''),
    contact_address = nullif(btrim(p_site ->> 'contact_address'), ''),
    facebook_url = nullif(btrim(p_site ->> 'facebook_url'), ''),
    instagram_url = nullif(btrim(p_site ->> 'instagram_url'), ''),
    tiktok_url = nullif(btrim(p_site ->> 'tiktok_url'), ''),
    youtube_url = nullif(btrim(p_site ->> 'youtube_url'), ''),
    footer_blurb = nullif(btrim(p_site ->> 'footer_blurb'), ''),
    seo_title = nullif(btrim(p_site ->> 'seo_title'), ''),
    seo_description = nullif(btrim(p_site ->> 'seo_description'), ''),
    show_features = coalesce((p_site ->> 'show_features')::boolean, s.show_features),
    show_join = coalesce((p_site ->> 'show_join')::boolean, s.show_join),
    show_faq = coalesce((p_site ->> 'show_faq')::boolean, s.show_faq),
    show_contact = coalesce((p_site ->> 'show_contact')::boolean, s.show_contact),
    updated_at = now()
  where s.tenant_id = v_tenant;
  if p_tenant is not null and p_tenant is distinct from app.my_tenant() then
    perform app.log(v_tenant, 'platform_admin', 'site_edited', v_tenant, '{}');
  end if;
end $$;

create function public.update_tenant_name(p_tenant uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  if p_tenant is not null and p_tenant is distinct from app.my_tenant() then
    perform app.require_platform();
    v_tenant := p_tenant;
  else
    v_tenant := app.require_tenant();
  end if;
  update public.tenants set name = btrim(p_name), updated_at = now() where id = v_tenant;
end $$;

create function public.list_registrations(p_tenant uuid default null, p_q text default null, p_page integer default 1)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_q text := nullif(btrim(p_q), '');
  v_like text;
  v_page integer := least(greatest(coalesce(p_page, 1), 1), 10000);
  v_total bigint;
  v_rows jsonb;
  c_size constant integer := 25;
begin
  if p_tenant is not null and p_tenant is distinct from app.my_tenant() then
    -- A platform admin reads another tenant's people only with a live, logged grant.
    if not app.has_support(p_tenant) then raise exception 'You do not have access to that.' using errcode = '42501'; end if;
    v_tenant := p_tenant;
    if v_page = 1 and v_q is null then perform app.log(v_tenant, 'platform_admin', 'support_view', null, '{}'); end if;
  else
    v_tenant := app.require_tenant();
  end if;
  v_like := '%' || app.like_escape(coalesce(v_q, '')) || '%';
  select count(*) into v_total from public.registrations r
    where r.tenant_id = v_tenant
      and (v_q is null or r.full_name ilike v_like or r.email ilike v_like or r.mobile ilike v_like or r.city ilike v_like);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id), '[]'::jsonb) into v_rows from (
    select r.id, r.full_name, r.email, r.mobile, r.city, r.member_type, r.created_at
    from public.registrations r
    where r.tenant_id = v_tenant
      and (v_q is null or r.full_name ilike v_like or r.email ilike v_like or r.mobile ilike v_like or r.city ilike v_like)
    order by r.created_at desc, r.id
    limit c_size offset (v_page - 1) * c_size) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', c_size);
end $$;

create function public.delete_registration(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := app.require_tenant(); v_n integer;
begin
  delete from public.registrations where id = p_id and tenant_id = v_tenant;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registration not found.' using errcode = 'GS404'; end if;
  perform app.log(v_tenant, 'tenant_admin', 'registration_deleted', p_id, '{}');
end $$;

-- One jsonb value, not a row set: PostgREST caps row sets (1000 by default), which would cut the file short.
create function public.export_registrations() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := app.require_tenant(); v_rows jsonb; v_n integer;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.registered_at desc, x.id), '[]'::jsonb), count(*) into v_rows, v_n from (
    select r.id, r.full_name, r.email, r.mobile, r.city, r.member_type, r.created_at as registered_at
    from public.registrations r where r.tenant_id = v_tenant
    order by r.created_at desc, r.id limit 20000) x;
  perform app.log(v_tenant, 'tenant_admin', 'registrations_exported', null, jsonb_build_object('rows', v_n));
  return v_rows;
end $$;

create function public.list_my_audit(p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tenant uuid := app.require_tenant(); v_page integer := least(greatest(coalesce(p_page, 1), 1), 10000);
begin
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
      select a.id, a.at, a.actor_kind, a.action, a.detail from public.audit_log a
      where a.tenant_id = v_tenant order by a.at desc, a.id desc limit 25 offset (v_page - 1) * 25) x), '[]'::jsonb),
    'page', v_page, 'page_size', 25);
end $$;

-- ============================================================================
-- Platform (super admin) functions. Every one starts with app.require_platform(): member + aal2.
-- ============================================================================

create function public.platform_list_tenants(p_q text default null, p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(btrim(p_q), '');
  v_like text;
  v_page integer := least(greatest(coalesce(p_page, 1), 1), 10000);
  v_total bigint;
  v_rows jsonb;
begin
  perform app.require_platform();
  v_like := '%' || app.like_escape(coalesce(v_q, '')) || '%';
  select count(*) into v_total from public.tenants t
    left join public.tenant_admins a on a.tenant_id = t.id left join auth.users u on u.id = a.user_id
    where v_q is null or t.slug ilike v_like or t.name ilike v_like or u.email ilike v_like;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id), '[]'::jsonb) into v_rows from (
    select t.id, t.slug, t.name, t.status, t.created_at, u.email as admin_email,
           (select count(*) from public.registrations r where r.tenant_id = t.id) as registrations
    from public.tenants t
    left join public.tenant_admins a on a.tenant_id = t.id left join auth.users u on u.id = a.user_id
    where v_q is null or t.slug ilike v_like or t.name ilike v_like or u.email ilike v_like
    order by t.created_at desc, t.id limit 25 offset (v_page - 1) * 25) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', 25);
end $$;

create function public.platform_get_tenant(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform app.require_platform();
  select jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status, 'created_at', t.created_at,
      'admin_email', u.email, 'admin_name', a.full_name,
      'registrations', (select count(*) from public.registrations r where r.tenant_id = t.id),
      'support_expires_at', (select max(s.expires_at) from public.support_access s
                             where s.tenant_id = t.id and s.admin_id = auth.uid() and s.expires_at > now()))
    into v
  from public.tenants t
  left join public.tenant_admins a on a.tenant_id = t.id left join auth.users u on u.id = a.user_id
  where t.id = p_tenant;
  if v is null then raise exception 'Tenant not found.' using errcode = 'GS404'; end if;
  return v;
end $$;

create function public.platform_set_status(p_tenant uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform();
  if p_status not in ('active', 'suspended') then raise exception 'Status must be active or suspended.'; end if;
  update public.tenants set status = p_status, updated_at = now() where id = p_tenant;
  if not found then raise exception 'Tenant not found.' using errcode = 'GS404'; end if;
  perform app.log(p_tenant, 'platform_admin', case when p_status = 'suspended' then 'tenant_suspended' else 'tenant_reactivated' end, p_tenant, '{}');
end $$;

create function public.platform_set_slug(p_tenant uuid, p_slug text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  perform app.require_platform();
  select slug into v_old from public.tenants where id = p_tenant for update;
  if not found then raise exception 'Tenant not found.' using errcode = 'GS404'; end if;
  if v_old = p_slug then return; end if;
  case app.slug_problem(p_slug)
    when 'invalid' then raise exception 'Use 3 to 40 letters, numbers or hyphens.';
    when 'reserved' then raise exception 'That address is on the reserved list.';
    when 'taken' then raise exception 'That address is taken.';
    else null;
  end case;
  update public.tenants set slug = p_slug, updated_at = now() where id = p_tenant;
  perform app.log(p_tenant, 'platform_admin', 'slug_changed', p_tenant, jsonb_build_object('from', v_old, 'to', p_slug));
exception when unique_violation then
  raise exception 'That address is taken.';
end $$;

create function public.platform_grant_support(p_tenant uuid, p_reason text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_exp timestamptz := now() + interval '1 hour';
begin
  perform app.require_platform();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Give a reason of at least 10 characters.'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'Tenant not found.' using errcode = 'GS404'; end if;
  insert into public.support_access (tenant_id, admin_id, reason, expires_at) values (p_tenant, auth.uid(), btrim(p_reason), v_exp);
  perform app.log(p_tenant, 'platform_admin', 'support_granted', p_tenant, jsonb_build_object('reason', btrim(p_reason), 'expires_at', v_exp));
  return v_exp;
end $$;

create function public.platform_list_audit(p_tenant uuid default null, p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_page integer := least(greatest(coalesce(p_page, 1), 1), 10000);
begin
  perform app.require_platform();
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc) from (
      select a.id, a.at, a.actor_kind, a.action, a.detail, a.tenant_id, t.slug as tenant_slug, u.email as actor_email
      from public.audit_log a
      left join public.tenants t on t.id = a.tenant_id
      left join auth.users u on u.id = a.actor_id
      where p_tenant is null or a.tenant_id = p_tenant
      order by a.at desc, a.id desc limit 50 offset (v_page - 1) * 50) x), '[]'::jsonb),
    'page', v_page, 'page_size', 50);
end $$;

create function public.platform_list_reserved() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_platform();
  return coalesce((select jsonb_agg(r.slug order by r.slug) from public.reserved_slugs r), '[]'::jsonb);
end $$;

create function public.platform_add_reserved(p_slug text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform();
  if p_slug is null or p_slug !~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' then raise exception 'Use letters, numbers or hyphens.'; end if;
  insert into public.reserved_slugs (slug) values (p_slug) on conflict do nothing;
  perform app.log(null, 'platform_admin', 'reserved_added', null, jsonb_build_object('slug', p_slug));
end $$;

create function public.platform_remove_reserved(p_slug text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform();
  delete from public.reserved_slugs where slug = p_slug;
  perform app.log(null, 'platform_admin', 'reserved_removed', null, jsonb_build_object('slug', p_slug));
end $$;

-- Run once by scripts/create-super-admin.ts with the service role. Nobody else can call it.
create function public.bootstrap_platform_admin(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into app.platform_admins (user_id) values (p_user) on conflict do nothing;
  insert into public.audit_log (actor_kind, action, target_id) values ('system', 'platform_admin_added', p_user);
end $$;

-- ============================================================================
-- Grants: functions
-- ============================================================================

revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;

-- Policies run as the caller, so the three helpers they use must be callable.
grant execute on function app.is_platform_admin(), app.my_tenant(), app.has_support(uuid) to authenticated;

-- anon: exactly three. A test fails if this list grows without a decision.
grant execute on function public.get_site(text), public.slug_status(text),
  public.register_member(text, text, text, text, text, text) to anon, authenticated;

grant execute on function
  public.whoami(), public.activate_my_tenant(text), public.get_admin_site(uuid), public.save_site(uuid, jsonb),
  public.update_tenant_name(uuid, text), public.list_registrations(uuid, text, integer), public.delete_registration(uuid),
  public.export_registrations(), public.list_my_audit(integer),
  public.platform_list_tenants(text, integer), public.platform_get_tenant(uuid), public.platform_set_status(uuid, text),
  public.platform_set_slug(uuid, text), public.platform_grant_support(uuid, text), public.platform_list_audit(uuid, integer),
  public.platform_list_reserved(), public.platform_add_reserved(text), public.platform_remove_reserved(text)
  to authenticated;

grant execute on function public.bootstrap_platform_admin(uuid) to service_role;

-- ============================================================================
-- Grants and policies: tables. Reads only; every write goes through a function above.
-- ============================================================================

grant select on public.tenants, public.tenant_admins, public.site_settings, public.audit_log, public.support_access to authenticated;
grant select (id, tenant_id, full_name, email, mobile, city, member_type, consented_at, created_at) on public.registrations to authenticated;

create policy tenants_read on public.tenants for select to authenticated
  using (id = (select app.my_tenant()) or (select app.is_platform_admin()));

create policy tenant_admins_read on public.tenant_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_platform_admin()));

create policy site_settings_read on public.site_settings for select to authenticated
  using (tenant_id = (select app.my_tenant()) or (select app.is_platform_admin()));

create policy registrations_read on public.registrations for select to authenticated
  using (tenant_id = (select app.my_tenant()) or app.has_support(tenant_id));

create policy audit_log_read on public.audit_log for select to authenticated
  using (tenant_id = (select app.my_tenant()) or (select app.is_platform_admin()));

create policy support_access_read on public.support_access for select to authenticated
  using (tenant_id = (select app.my_tenant()) or (admin_id = (select auth.uid()) and (select app.is_platform_admin())));

-- reserved_slugs and app.platform_admins: RLS on, no policy, no grant. Definer functions only.

-- ============================================================================
-- Storage: public-read bucket for brand images, written only into the caller's own tenant folder.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy brand_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
    and ((storage.foldername(name))[1] = (select app.my_tenant())::text or (select app.is_platform_admin())));

create policy brand_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand'
    and ((storage.foldername(name))[1] = (select app.my_tenant())::text or (select app.is_platform_admin())));

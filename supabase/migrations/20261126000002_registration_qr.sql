-- Registration form fields (title, category, address, where found), a random invite code per person,
-- who-invited-whom, and a private member card that needs no login.
--
-- Rules from the first migration still hold: RLS on, clients read only, every write is a definer function,
-- a new function is revoked from public/anon/authenticated and then granted to exactly who needs it.
-- anon goes from three functions to four: get_member_card is the fourth, on purpose (docs/THREAT_MODEL.md T4, T24).

-- ============================================================================
-- Tenant form settings
-- ============================================================================

alter table public.site_settings
  add column reg_category_label text not null default 'Category',
  add column reg_categories text[] not null default '{}',   -- empty list = the category field is off
  add column reg_show_address boolean not null default false,
  add column reg_show_source boolean not null default false,
  add constraint site_reg_category_label check (char_length(btrim(reg_category_label)) between 1 and 40),
  add constraint site_reg_categories check (cardinality(reg_categories) <= 20);

-- ============================================================================
-- Registrations: new columns
-- ============================================================================

alter table public.registrations
  add column name_prefix text,    -- class: personal (Mr., Dr., ...)
  add column category text,       -- class: personal (a choice from the tenant's own list, e.g. a specialty)
  add column address text,        -- class: personal
  add column source text,         -- class: personal (where the person says they found the tenant)
  add column member_code integer, -- class: identifier. Random, shown on the invite QR. Not secret.
  add column referred_by uuid references public.registrations (id) on delete set null, -- class: personal (who invited this person; same tenant, checked in register_member)
  add column link_hash text;      -- class: secret. sha256 of the private link token. Never granted to a client, never returned.

-- Codes come from a trigger so that every insert path gets one. Random, not a counter, so a code does not
-- tell anyone how many people a tenant has.
create function app.pick_member_code(p_tenant uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer; n integer := 0;
begin
  loop
    v := 100000 + floor(random() * 900000)::integer;
    exit when not exists (select 1 from public.registrations r where r.tenant_id = p_tenant and r.member_code = v);
    n := n + 1;
    if n > 50 then raise exception 'Registrations are busy right now. Try again later.'; end if;
  end loop;
  return v;
end $$;

create function app.registration_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.member_code is null then new.member_code := app.pick_member_code(new.tenant_id); end if;
  return new;
end $$;

update public.registrations set member_code = app.pick_member_code(tenant_id) where member_code is null;
alter table public.registrations alter column member_code set not null;

create trigger registrations_code before insert on public.registrations
  for each row execute function app.registration_code();

alter table public.registrations
  add constraint registrations_prefix check (name_prefix is null or name_prefix in ('Mr.', 'Ms.', 'Mrs.', 'Mx.', 'Dr.', 'Dra.', 'Prof.', 'Atty.')),
  add constraint registrations_category_len check (category is null or char_length(category) between 1 and 60),
  add constraint registrations_address_len check (address is null or char_length(address) between 2 and 200),
  add constraint registrations_source_len check (source is null or char_length(source) between 1 and 120),
  add constraint registrations_code_range check (member_code between 100000 and 999999),
  add constraint registrations_link_hash check (link_hash is null or link_hash ~ '^[0-9a-f]{64}$');

create unique index registrations_tenant_code_key on public.registrations (tenant_id, member_code);
create index registrations_referred_by on public.registrations (referred_by) where referred_by is not null;
create index registrations_link_lookup on public.registrations (tenant_id, link_hash) where link_hash is not null;

-- Clients read the new columns, except link_hash, which no client ever reads.
grant select (name_prefix, category, address, source, member_code, referred_by) on public.registrations to authenticated;

-- ============================================================================
-- Helper: a clean list of options (trimmed, no blanks, no repeats)
-- ============================================================================

create function app.clean_list(p jsonb, p_max_items integer, p_max_len integer) returns text[]
language plpgsql immutable set search_path = '' as $$
declare v text[] := '{}'; e jsonb; s text;
begin
  if p is null or jsonb_typeof(p) = 'null' then return v; end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'Send the options as a list.'; end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'string' then raise exception 'Each option must be text.'; end if;
    s := btrim(e #>> '{}');
    continue when s = '';
    if char_length(s) > p_max_len then raise exception 'Each option can be up to % characters.', p_max_len; end if;
    if lower(s) = any (select lower(x) from unnest(v) x) then raise exception 'An option appears twice: %', s; end if;
    v := v || s;
  end loop;
  if cardinality(v) > p_max_items then raise exception 'Use up to % options.', p_max_items; end if;
  return v;
end $$;

-- ============================================================================
-- save_site: the same function, with the four form settings added
-- ============================================================================

create or replace function public.save_site(p_tenant uuid, p_site jsonb) returns void
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
    reg_category_label = coalesce(nullif(btrim(p_site ->> 'reg_category_label'), ''), s.reg_category_label),
    reg_categories = case when p_site ? 'reg_categories' then app.clean_list(p_site -> 'reg_categories', 20, 60) else s.reg_categories end,
    reg_show_address = coalesce((p_site ->> 'reg_show_address')::boolean, s.reg_show_address),
    reg_show_source = coalesce((p_site ->> 'reg_show_source')::boolean, s.reg_show_source),
    updated_at = now()
  where s.tenant_id = v_tenant;
  if p_tenant is not null and p_tenant is distinct from app.my_tenant() then
    perform app.log(v_tenant, 'platform_admin', 'site_edited', v_tenant, '{}');
  end if;
end $$;

-- ============================================================================
-- Public: register (one jsonb), and the private member card
-- ============================================================================

drop function public.register_member(text, text, text, text, text, text);

-- Always succeeds the same way for a duplicate email, so the page cannot be used to test who is registered.
-- Fields the tenant has switched off are ignored, not stored. An invite code from another tenant, or an
-- unknown one, is ignored without an error.
create function public.register_member(p_slug text, p_member jsonb, p_notice_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  s public.site_settings;
  v_category text;
  v_address text;
  v_source text;
  v_ref uuid;
  v_tries integer := 0;
begin
  if p_member is null or jsonb_typeof(p_member) <> 'object' then raise exception 'Some values are missing or not allowed.'; end if;
  select id into v_tenant from public.tenants where slug = p_slug and status = 'active';
  if v_tenant is null then raise exception 'This site is not taking registrations.'; end if;
  if (select count(*) from public.registrations r where r.tenant_id = v_tenant and r.created_at > now() - interval '1 hour') >= 500 then
    raise exception 'Registrations are busy right now. Try again later.';
  end if;
  select * into s from public.site_settings where tenant_id = v_tenant;

  v_category := nullif(btrim(p_member ->> 'category'), '');
  if cardinality(s.reg_categories) > 0 then
    if v_category is null or not (v_category = any (s.reg_categories)) then raise exception 'Choose one of the listed options.'; end if;
  else
    v_category := null;
  end if;

  v_address := nullif(btrim(p_member ->> 'address'), '');
  if s.reg_show_address then
    if v_address is null then raise exception 'Enter your address.'; end if;
  else
    v_address := null;
  end if;

  v_source := case when s.reg_show_source then nullif(btrim(p_member ->> 'source'), '') end;

  if (p_member ->> 'ref_code') ~ '^[0-9]{6}$' then
    select r.id into v_ref from public.registrations r
      where r.tenant_id = v_tenant and r.member_code = (p_member ->> 'ref_code')::integer;
  end if;

  loop
    begin
      insert into public.registrations as reg
        (tenant_id, name_prefix, full_name, email, mobile, city, category, address, source, referred_by, link_hash, consent_notice_version)
      values
        (v_tenant, nullif(btrim(p_member ->> 'name_prefix'), ''), btrim(p_member ->> 'full_name'), lower(btrim(p_member ->> 'email')),
         p_member ->> 'mobile', btrim(p_member ->> 'city'), v_category, v_address, v_source, v_ref, p_member ->> 'link_hash', p_notice_version)
      on conflict (tenant_id, email) do update set link_hash = excluded.link_hash
        where reg.link_hash is null and excluded.link_hash is not null;
      exit;
    exception when unique_violation then
      -- Two sign-ups drew the same random code at the same moment: draw again.
      v_tries := v_tries + 1;
      if v_tries >= 3 then raise; end if;
    end;
  end loop;
end $$;

-- The one thing a person can read about themselves without signing in: their code and how many people used it.
-- The link hash is unguessable, so possession of the link is the proof. No name, no email.
create function public.get_member_card(p_slug text, p_link_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'member_code', r.member_code,
    'invited', (select count(*) from public.registrations c where c.referred_by = r.id))
  from public.tenants t join public.registrations r on r.tenant_id = t.id
  where t.slug = p_slug and t.status = 'active'
    and p_link_hash ~ '^[0-9a-f]{64}$' and r.link_hash = p_link_hash
  limit 1
$$;

-- ============================================================================
-- Admin: list and export carry the new fields
-- ============================================================================

drop function public.list_registrations(uuid, text, integer);

create function public.list_registrations(p_tenant uuid default null, p_q text default null, p_page integer default 1, p_ref integer default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_q text := nullif(btrim(p_q), '');
  v_like text;
  v_page integer := least(greatest(coalesce(p_page, 1), 1), 10000);
  v_ref_id uuid;
  v_total bigint;
  v_rows jsonb;
  c_size constant integer := 25;
begin
  if p_tenant is not null and p_tenant is distinct from app.my_tenant() then
    -- A platform admin reads another tenant's people only with a live, logged grant.
    if not app.has_support(p_tenant) then raise exception 'You do not have access to that.' using errcode = '42501'; end if;
    v_tenant := p_tenant;
    if v_page = 1 and v_q is null and p_ref is null then perform app.log(v_tenant, 'platform_admin', 'support_view', null, '{}'); end if;
  else
    v_tenant := app.require_tenant();
  end if;
  v_like := '%' || app.like_escape(coalesce(v_q, '')) || '%';
  -- An unknown code leaves v_ref_id null, so "referred_by = null" matches nobody.
  if p_ref is not null then
    select r.id into v_ref_id from public.registrations r where r.tenant_id = v_tenant and r.member_code = p_ref;
  end if;
  select count(*) into v_total from public.registrations r
    where r.tenant_id = v_tenant
      and (p_ref is null or r.referred_by = v_ref_id)
      and (v_q is null or r.full_name ilike v_like or r.email ilike v_like or r.mobile ilike v_like or r.city ilike v_like
           or r.category ilike v_like or r.address ilike v_like or r.source ilike v_like or r.member_code::text = v_q);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id), '[]'::jsonb) into v_rows from (
    select r.id, r.name_prefix, r.full_name, r.email, r.mobile, r.city, r.category, r.address, r.source, r.member_type,
           r.member_code, r.created_at, inv.member_code as referred_by_code, inv.full_name as referred_by_name
    from public.registrations r left join public.registrations inv on inv.id = r.referred_by
    where r.tenant_id = v_tenant
      and (p_ref is null or r.referred_by = v_ref_id)
      and (v_q is null or r.full_name ilike v_like or r.email ilike v_like or r.mobile ilike v_like or r.city ilike v_like
           or r.category ilike v_like or r.address ilike v_like or r.source ilike v_like or r.member_code::text = v_q)
    order by r.created_at desc, r.id
    limit c_size offset (v_page - 1) * c_size) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', c_size);
end $$;

create or replace function public.export_registrations() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := app.require_tenant(); v_rows jsonb; v_n integer;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.registered_at desc, x.id), '[]'::jsonb), count(*) into v_rows, v_n from (
    select r.id, r.name_prefix, r.full_name, r.email, r.mobile, r.city, r.category, r.address, r.source, r.member_type,
           r.member_code, inv.member_code as referred_by_code, r.created_at as registered_at
    from public.registrations r left join public.registrations inv on inv.id = r.referred_by
    where r.tenant_id = v_tenant
    order by r.created_at desc, r.id limit 20000) x;
  perform app.log(v_tenant, 'tenant_admin', 'registrations_exported', null, jsonb_build_object('rows', v_n));
  return v_rows;
end $$;

-- ============================================================================
-- Grants
-- ============================================================================

revoke all on function app.pick_member_code(uuid), app.registration_code(), app.clean_list(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.register_member(text, jsonb, text), public.get_member_card(text, text),
  public.list_registrations(uuid, text, integer, integer) from public, anon, authenticated;

-- anon: exactly four now (get_site, slug_status, register_member, get_member_card).
grant execute on function public.register_member(text, jsonb, text), public.get_member_card(text, text) to anon, authenticated;
grant execute on function public.list_registrations(uuid, text, integer, integer) to authenticated;

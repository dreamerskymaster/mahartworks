-- Shop for mah-artworks-shop.pages.dev: tables, row level security and grants.
-- Everything lives in the `shop` schema, which is NOT exposed to the Data API. The browser reaches it only
-- through the `public.shop_*` functions (next migration). RLS is still on everywhere as a second wall, so
-- exposing the schema later would not leak anything.
-- Never touches the owner's other tables (personal.*, public.job_outreach).

create schema if not exists shop;
revoke all on schema shop from public;
grant usage on schema shop to anon, authenticated;

create type shop.order_status as enum
  ('awaiting_payment', 'payment_submitted', 'paid', 'shipped', 'delivered', 'cancelled');

-- People allowed to use /admin. Seeded by hand: insert into shop.admins (user_id) values ('<auth user id>');
create table shop.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- One row per artwork on the main site (ids are permanent). Nothing is for sale until she prices it.
create table shop.products (
  artwork_id text primary key check (artwork_id ~ '^[a-z0-9-]{1,120}$'),
  cert text check (cert is null or cert ~ '^MS-[0-9]{4}-[0-9]{4}$'),
  title text not null check (length(title) between 1 and 200),
  category text not null default 'paintings',
  price_inr integer check (price_inr is null or price_inr between 1 and 10000000),
  for_sale boolean not null default false,
  sold boolean not null default false,
  medium text check (medium is null or length(medium) <= 120),
  width_cm numeric(6, 1) check (width_cm is null or width_cm between 1 and 1000),
  height_cm numeric(6, 1) check (height_cm is null or height_cm between 1 and 1000),
  depth_cm numeric(6, 1) check (depth_cm is null or depth_cm between 0.1 and 500),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 0.01 and 500),
  on_site boolean not null default true,          -- false once the artwork is removed from the main site
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint priced_when_for_sale check (not for_sale or price_inr is not null)
);
create index products_listed_idx on shop.products (updated_at desc) where for_sale or sold;

create table shop.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text check (name is null or length(name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9][0-9 -]{8,16}[0-9]$'),
  updated_at timestamptz not null default now()
);

create table shop.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text check (label is null or length(label) <= 40),
  name text not null check (length(name) between 1 and 120),
  phone text not null check (phone ~ '^\+?[0-9][0-9 -]{8,16}[0-9]$'),
  line1 text not null check (length(line1) between 1 and 200),
  line2 text check (line2 is null or length(line2) <= 200),
  city text not null check (length(city) between 1 and 80),
  state text not null check (length(state) between 1 and 80),
  pin text not null check (pin ~ '^[1-9][0-9]{5}$'),
  country text not null default 'IN' check (country = 'IN'),   -- buyers abroad enquire by email
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on shop.addresses (user_id);

create sequence shop.order_no_seq;

create table shop.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique check (order_no ~ '^MSA-[0-9]{4}-[0-9]{5,}$'),
  user_id uuid references auth.users (id) on delete set null,   -- order records outlive accounts (tax law)
  buyer_email text,
  status shop.order_status not null default 'awaiting_payment',
  subtotal_inr integer not null check (subtotal_inr > 0),
  shipping_inr integer not null check (shipping_inr between 0 and 100000),
  total_inr integer generated always as (subtotal_inr + shipping_inr) stored,
  pickup boolean not null default false,
  shipping_code text not null,
  shipping_label text,
  shipping_eta text,
  shipping_verified boolean not null default false,   -- true when the quote's signature checked out
  ship_to jsonb not null,
  buyer_note text check (buyer_note is null or length(buyer_note) <= 1000),
  utr text check (utr is null or utr ~ '^[0-9]{12}$'),
  courier text,
  tracking_no text,
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  admin_note text,
  expires_at timestamptz,                             -- an unpaid order releases its artworks after this
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payment_submitted_at timestamptz,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);
create index orders_user_idx on shop.orders (user_id, created_at desc);
create index orders_status_idx on shop.orders (status, created_at desc);
create index orders_expiry_idx on shop.orders (expires_at) where status = 'awaiting_payment';
-- The same bank reference can't pay for two live orders.
create unique index orders_utr_live_idx on shop.orders (utr) where utr is not null and status <> 'cancelled';

create table shop.order_items (
  order_id uuid not null references shop.orders (id) on delete cascade,
  artwork_id text not null references shop.products (artwork_id),
  title text not null,
  cert text,
  price_inr integer not null check (price_inr > 0),
  active boolean not null default true,   -- false once the order is cancelled or expired
  primary key (order_id, artwork_id)
);
create index order_items_artwork_idx on shop.order_items (artwork_id);
-- Each artwork is one of a kind: at most one live order can hold it. This is the hard guarantee
-- against selling an original twice, even if two buyers check out in the same second.
create unique index order_items_one_live_idx on shop.order_items (artwork_id) where active;

create table shop.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references shop.orders (id) on delete cascade,
  at timestamptz not null default now(),
  status shop.order_status,
  actor uuid,
  actor_role text not null check (actor_role in ('buyer', 'admin', 'system')),
  note text
);
create index order_events_order_idx on shop.order_events (order_id, at);

create table shop.settings (
  key text primary key,
  value text,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into shop.settings (key, value, is_public) values
  ('upi_vpa', null, false),                                   -- her UPI ID; payments stay closed until set
  ('upi_payee_name', 'Mahalakshmi Srikanth', true),
  ('pickup_prefixes', '400', true),                           -- comma list of PIN prefixes with free pickup
  ('pickup_note', 'Free pickup in Mumbai. After payment we will call you to arrange a time and share the pickup address.', true),
  ('payment_window_hours', '48', true);

-- updated_at
create function shop.touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger products_touch before update on shop.products for each row execute function shop.touch();
create trigger profiles_touch before update on shop.profiles for each row execute function shop.touch();
create trigger orders_touch before update on shop.orders for each row execute function shop.touch();
create trigger settings_touch before update on shop.settings for each row execute function shop.touch();

-- Admin check used by policies and functions. SECURITY DEFINER so it can read shop.admins without
-- recursion; it only ever answers for the caller (auth.uid()).
create function shop.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from shop.admins where user_id = (select auth.uid()))
$$;
revoke all on function shop.is_admin() from public;
grant execute on function shop.is_admin() to anon, authenticated;

-- Row level security everywhere.
alter table shop.admins enable row level security;
alter table shop.products enable row level security;
alter table shop.profiles enable row level security;
alter table shop.addresses enable row level security;
alter table shop.orders enable row level security;
alter table shop.order_items enable row level security;
alter table shop.order_events enable row level security;
alter table shop.settings enable row level security;

create policy admins_self on shop.admins for select to authenticated using (user_id = (select auth.uid()));

create policy products_public on shop.products for select to anon using (for_sale or sold);
create policy products_read on shop.products for select to authenticated
  using (for_sale or sold or (select shop.is_admin()));
create policy products_admin_insert on shop.products for insert to authenticated with check ((select shop.is_admin()));
create policy products_admin_update on shop.products for update to authenticated
  using ((select shop.is_admin())) with check ((select shop.is_admin()));

create policy profiles_own on shop.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profiles_admin_read on shop.profiles for select to authenticated using ((select shop.is_admin()));

create policy addresses_own on shop.addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy orders_read on shop.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select shop.is_admin()));
create policy order_items_read on shop.order_items for select to authenticated
  using (exists (select 1 from shop.orders o where o.id = order_id
                 and (o.user_id = (select auth.uid()) or (select shop.is_admin()))));
create policy order_events_read on shop.order_events for select to authenticated
  using (exists (select 1 from shop.orders o where o.id = order_id
                 and (o.user_id = (select auth.uid()) or (select shop.is_admin()))));

create policy settings_public on shop.settings for select to anon using (is_public);
create policy settings_read on shop.settings for select to authenticated using (is_public or (select shop.is_admin()));
create policy settings_admin_update on shop.settings for update to authenticated
  using ((select shop.is_admin())) with check ((select shop.is_admin()));

-- Grants: orders, items and events have no write grants at all; they change only through the
-- SECURITY DEFINER functions, which check who is calling.
revoke all on all tables in schema shop from public, anon, authenticated;
grant select on shop.products, shop.settings to anon;
grant select on shop.products, shop.settings, shop.admins, shop.orders, shop.order_items, shop.order_events to authenticated;
grant insert, update on shop.products to authenticated;
grant update on shop.settings to authenticated;
grant select, insert, update, delete on shop.profiles, shop.addresses to authenticated;
revoke all on sequence shop.order_no_seq from public, anon, authenticated;

-- The shop's API: `public.shop_*` functions called with supabase.rpc(). The `shop` schema itself is not
-- exposed, so these are the only doors in.
--   * SECURITY DEFINER functions check the caller themselves (auth.uid(), shop.is_admin()) and have an
--     empty search_path with fully qualified names.
--   * SECURITY INVOKER functions run as the caller, so the RLS policies of the previous migration apply.
-- Every function's EXECUTE is revoked from PUBLIC/anon and granted only to the roles that need it.
-- Prices and totals are always computed here from shop.products; the browser's numbers are never trusted.

alter default privileges in schema shop revoke execute on functions from public;

-- ---------- internal helpers (schema shop: not reachable over the API) ----------

create function shop.setting(p_key text) returns text language sql stable security definer set search_path = '' as $$
  select value from shop.settings where key = p_key
$$;

-- available | reserved | sold. An unpaid order past its expiry no longer holds the artwork.
create function shop.product_status(p_id text, p_sold boolean) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_sold then 'sold'
    when exists (select 1 from shop.order_items i join shop.orders o on o.id = i.order_id
                 where i.artwork_id = p_id and i.active
                   and not (o.status = 'awaiting_payment' and o.expires_at < now())) then 'reserved'
    else 'available' end
$$;

create function shop.product_json(p shop.products) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p.artwork_id, 'cert', p.cert, 'title', p.title, 'category', p.category,
    'price_inr', p.price_inr, 'for_sale', p.for_sale, 'sold', p.sold, 'medium', p.medium,
    'width_cm', p.width_cm, 'height_cm', p.height_cm, 'depth_cm', p.depth_cm, 'weight_kg', p.weight_kg,
    'on_site', p.on_site, 'updated_at', p.updated_at, 'status', shop.product_status(p.artwork_id, p.sold))
$$;

-- Releases the artworks of an order (cancelled or expired). A paid order also un-marks them sold.
create function shop.release_order(p_order uuid, p_was_paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_was_paid then
    update shop.products set sold = false
     where artwork_id in (select artwork_id from shop.order_items where order_id = p_order and active);
  end if;
  update shop.order_items set active = false where order_id = p_order and active;
end $$;

-- Cancels unpaid orders whose payment window has passed. Called lazily by the functions below, so no
-- scheduler is needed.
create function shop.expire_stale() returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id from shop.orders where status = 'awaiting_payment' and expires_at < now() for update skip locked loop
    update shop.orders set status = 'cancelled', cancelled_at = now(), expires_at = null where id = r.id;
    perform shop.release_order(r.id, false);
    insert into shop.order_events (order_id, status, actor_role, note)
      values (r.id, 'cancelled', 'system', 'Payment not received in time; the artwork is available again.');
    n := n + 1;
  end loop;
  return n;
end $$;

create function shop.next_order_no() returns text language sql volatile security definer set search_path = '' as $$
  select 'MSA-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('shop.order_no_seq')::text, 5, '0')
$$;

create function shop.order_json(o shop.orders, p_admin boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order_no', o.order_no, 'status', o.status, 'subtotal_inr', o.subtotal_inr, 'shipping_inr', o.shipping_inr,
    'total_inr', o.total_inr, 'pickup', o.pickup, 'shipping_code', o.shipping_code, 'shipping_label', o.shipping_label,
    'shipping_eta', o.shipping_eta, 'ship_to', o.ship_to, 'buyer_note', o.buyer_note, 'utr', o.utr,
    'courier', o.courier, 'tracking_no', o.tracking_no, 'tracking_url', o.tracking_url,
    'expires_at', o.expires_at, 'created_at', o.created_at, 'payment_submitted_at', o.payment_submitted_at,
    'paid_at', o.paid_at, 'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.artwork_id, 'title', i.title, 'cert', i.cert,
        'price_inr', i.price_inr, 'medium', p.medium, 'width_cm', p.width_cm, 'height_cm', p.height_cm,
        'depth_cm', p.depth_cm, 'category', p.category) order by i.title)
      from shop.order_items i join shop.products p on p.artwork_id = i.artwork_id where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'status', e.status, 'by', e.actor_role, 'note', e.note)
        order by e.at, e.id) from shop.order_events e where e.order_id = o.id), '[]'::jsonb)
  ) || case when p_admin then jsonb_build_object('buyer_email', o.buyer_email, 'shipping_verified', o.shipping_verified,
         'admin_note', o.admin_note, 'user_id', o.user_id) else '{}'::jsonb end
$$;

-- HMAC key shared with the /api/shipping-quote Pages Function, kept in Supabase Vault (never in the repo).
create function shop.quote_key() returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'shop_quote_key' limit 1
$$;
create function shop.quote_signing_enabled() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.secrets where name = 'shop_quote_key')
$$;

revoke all on function shop.setting(text), shop.product_status(text, boolean), shop.product_json(shop.products),
  shop.release_order(uuid, boolean), shop.expire_stale(), shop.next_order_no(), shop.order_json(shop.orders, boolean),
  shop.quote_key(), shop.quote_signing_enabled(), shop.touch() from public, anon, authenticated;
-- The invoker functions below (run as the signed-in user) need these two.
grant execute on function shop.product_json(shop.products), shop.product_status(text, boolean), shop.quote_signing_enabled() to authenticated;

-- ---------- public: anyone ----------

create function public.shop_settings() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'payments_open', coalesce(nullif(trim(shop.setting('upi_vpa')), ''), '') <> '',
    'payee', shop.setting('upi_payee_name'),
    'pickup_prefixes', coalesce((select jsonb_agg(trim(x)) from unnest(string_to_array(shop.setting('pickup_prefixes'), ',')) x
                                 where trim(x) <> ''), '[]'::jsonb),
    'pickup_note', shop.setting('pickup_note'),
    'payment_window_hours', coalesce(shop.setting('payment_window_hours')::int, 48))
$$;

-- Priced (for sale) or sold artworks only. p_ids narrows it (cart check, shipping quote).
create function public.shop_products(p_ids text[] default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(shop.product_json(p) order by p.sold, p.updated_at desc), '[]'::jsonb)
  from shop.products p
  where (p.for_sale or p.sold) and (p_ids is null or p.artwork_id = any (p_ids))
$$;

-- ---------- signed-in buyers ----------

create function public.shop_profile() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('email', (select auth.jwt()) ->> 'email', 'name', p.name, 'phone', p.phone)
  from (select 1) one left join shop.profiles p on p.user_id = (select auth.uid())
$$;

create function public.shop_save_profile(p_name text, p_phone text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'shop:sign_in_required'; end if;
  insert into shop.profiles (user_id, name, phone) values (auth.uid(), nullif(trim(p_name), ''), nullif(trim(p_phone), ''))
  on conflict (user_id) do update set name = excluded.name, phone = excluded.phone;
  return public.shop_profile();
end $$;

create function public.shop_addresses() returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(a) - 'user_id' order by a.is_default desc, a.created_at desc), '[]'::jsonb)
  from shop.addresses a where a.user_id = (select auth.uid())
$$;

create function public.shop_save_address(p jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; v_row shop.addresses;
begin
  if auth.uid() is null then raise exception 'shop:sign_in_required'; end if;
  if coalesce(p ->> 'country', 'IN') <> 'IN' then raise exception 'shop:india_only'; end if;
  if coalesce((p ->> 'is_default')::boolean, false) then
    update shop.addresses set is_default = false where user_id = auth.uid() and id is distinct from v_id;
  end if;
  if v_id is null then
    insert into shop.addresses (label, name, phone, line1, line2, city, state, pin, is_default)
    values (nullif(trim(p ->> 'label'), ''), trim(p ->> 'name'), trim(p ->> 'phone'), trim(p ->> 'line1'),
            nullif(trim(p ->> 'line2'), ''), trim(p ->> 'city'), trim(p ->> 'state'), trim(p ->> 'pin'),
            coalesce((p ->> 'is_default')::boolean, false))
    returning * into v_row;
  else
    update shop.addresses set label = nullif(trim(p ->> 'label'), ''), name = trim(p ->> 'name'), phone = trim(p ->> 'phone'),
      line1 = trim(p ->> 'line1'), line2 = nullif(trim(p ->> 'line2'), ''), city = trim(p ->> 'city'),
      state = trim(p ->> 'state'), pin = trim(p ->> 'pin'), is_default = coalesce((p ->> 'is_default')::boolean, false)
    where id = v_id and user_id = auth.uid() returning * into v_row;
    if v_row.id is null then raise exception 'shop:not_found'; end if;
  end if;
  return to_jsonb(v_row) - 'user_id';
end $$;

create function public.shop_delete_address(p_id uuid) returns boolean language sql security invoker set search_path = '' as $$
  with d as (delete from shop.addresses where id = p_id and user_id = (select auth.uid()) returning 1)
  select exists (select 1 from d)
$$;

-- Checkout. Re-reads every price, checks every artwork is still available, reserves them (one live order
-- per artwork, enforced by a unique index), snapshots the address and writes the order.
-- p_expected_subtotal is what the buyer saw: if prices changed meanwhile, the order is refused rather than
-- charging a different amount.
create function public.shop_place_order(p_items text[], p_address_id uuid, p_shipping jsonb,
                                        p_expected_subtotal integer default null, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_ids text[];
  v_addr shop.addresses;
  v_sub integer := 0; v_n integer := 0;
  v_p shop.products;
  v_code text := p_shipping ->> 'code';
  v_ship integer;
  v_verified boolean := false;
  v_key text; v_msg text; v_exp bigint;
  v_order shop.orders;
  v_hours integer := coalesce(shop.setting('payment_window_hours')::int, 48);
begin
  if v_uid is null then raise exception 'shop:sign_in_required'; end if;
  if coalesce(nullif(trim(shop.setting('upi_vpa')), ''), '') = '' then raise exception 'shop:payments_closed'; end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_items) x where x is not null;
  if v_ids is null or array_length(v_ids, 1) not between 1 and 20 then raise exception 'shop:bad_cart'; end if;

  perform shop.expire_stale();
  if (select count(*) from shop.orders where user_id = v_uid and status = 'awaiting_payment') >= 3 then
    raise exception 'shop:too_many_open_orders';
  end if;

  select * into v_addr from shop.addresses where id = p_address_id and user_id = v_uid;
  if v_addr.id is null then raise exception 'shop:bad_address'; end if;

  -- Lock the artworks so two checkouts of the same piece queue up here.
  for v_p in select * from shop.products where artwork_id = any (v_ids) order by artwork_id for update loop
    if not v_p.for_sale or v_p.sold or v_p.price_inr is null
       or shop.product_status(v_p.artwork_id, v_p.sold) <> 'available' then
      raise exception 'shop:unavailable:%', v_p.artwork_id;
    end if;
    v_sub := v_sub + v_p.price_inr; v_n := v_n + 1;
  end loop;
  if v_n <> array_length(v_ids, 1) then raise exception 'shop:unavailable'; end if;
  if p_expected_subtotal is not null and p_expected_subtotal <> v_sub then
    raise exception 'shop:price_changed:%', v_sub;
  end if;

  -- Shipping: free pickup only for pickup PINs; courier prices must carry a valid signed quote.
  if v_code is null or v_code !~ '^(pickup|est:[a-z0-9-]{1,40}|sr:[0-9]{1,10})$' then raise exception 'shop:bad_shipping'; end if;
  v_ship := (p_shipping ->> 'price_inr')::integer;
  if v_code = 'pickup' then
    if not exists (select 1 from unnest(string_to_array(shop.setting('pickup_prefixes'), ',')) x
                   where trim(x) <> '' and left(v_addr.pin, length(trim(x))) = trim(x)) then
      raise exception 'shop:pickup_not_available';
    end if;
    v_ship := 0; v_verified := true;
  else
    if v_ship is null or v_ship not between 0 and 100000 then raise exception 'shop:bad_shipping'; end if;
    v_key := shop.quote_key();
    if v_key is not null then
      v_exp := (p_shipping ->> 'exp')::bigint;
      v_msg := concat_ws('|', 'v1', v_addr.pin, array_to_string(v_ids, ','), v_code, v_ship::text, v_exp::text);
      if v_exp is null or v_exp < extract(epoch from now())
         or coalesce(p_shipping ->> 'sig', '') <> encode(extensions.hmac(convert_to(v_msg, 'UTF8'), convert_to(v_key, 'UTF8'), 'sha256'), 'hex') then
        raise exception 'shop:shipping_quote_invalid';
      end if;
      v_verified := true;
    end if;
  end if;

  insert into shop.orders (order_no, user_id, buyer_email, subtotal_inr, shipping_inr, pickup, shipping_code,
                           shipping_label, shipping_eta, shipping_verified, ship_to, buyer_note, expires_at)
  values (shop.next_order_no(), v_uid, (select email from auth.users where id = v_uid), v_sub, v_ship, v_code = 'pickup',
          v_code, left(p_shipping ->> 'label', 80), left(p_shipping ->> 'eta', 60), v_verified,
          jsonb_build_object('name', v_addr.name, 'phone', v_addr.phone, 'line1', v_addr.line1, 'line2', v_addr.line2,
                             'city', v_addr.city, 'state', v_addr.state, 'pin', v_addr.pin, 'country', v_addr.country),
          nullif(left(trim(p_note), 1000), ''), now() + make_interval(hours => v_hours))
  returning * into v_order;

  insert into shop.order_items (order_id, artwork_id, title, cert, price_inr)
  select v_order.id, p.artwork_id, p.title, p.cert, p.price_inr from shop.products p where p.artwork_id = any (v_ids);
  insert into shop.order_events (order_id, status, actor, actor_role, note)
  values (v_order.id, 'awaiting_payment', v_uid, 'buyer', 'Order placed; the artwork is held for you while you pay.');

  return shop.order_json(v_order, false);
exception when unique_violation then
  raise exception 'shop:unavailable';   -- someone else's order took it a moment earlier
end $$;

create function public.shop_my_orders() returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'shop:sign_in_required'; end if;
  perform shop.expire_stale();
  return coalesce((select jsonb_agg(shop.order_json(o, false) order by o.created_at desc)
                   from shop.orders o where o.user_id = auth.uid()), '[]'::jsonb);
end $$;

-- One order, for its buyer or an admin. While unpaid it includes what's needed to pay (UPI ID, payee).
create function public.shop_order(p_order_no text) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_o shop.orders; v_admin boolean := shop.is_admin(); v_out jsonb;
begin
  if auth.uid() is null then raise exception 'shop:sign_in_required'; end if;
  perform shop.expire_stale();
  select * into v_o from shop.orders where order_no = p_order_no;
  if v_o.id is null or (v_o.user_id is distinct from auth.uid() and not v_admin) then raise exception 'shop:not_found'; end if;
  v_out := shop.order_json(v_o, v_admin);
  if v_o.status in ('awaiting_payment', 'payment_submitted') then
    v_out := v_out || jsonb_build_object('pay', jsonb_build_object('vpa', shop.setting('upi_vpa'), 'payee', shop.setting('upi_payee_name')));
  end if;
  return v_out;
end $$;

create function public.shop_submit_utr(p_order_no text, p_utr text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_o shop.orders; v_utr text := regexp_replace(coalesce(p_utr, ''), '\s', '', 'g');
begin
  if auth.uid() is null then raise exception 'shop:sign_in_required'; end if;
  if v_utr !~ '^[0-9]{12}$' then raise exception 'shop:bad_utr'; end if;
  perform shop.expire_stale();
  select * into v_o from shop.orders where order_no = p_order_no and user_id = auth.uid() for update;
  if v_o.id is null then raise exception 'shop:not_found'; end if;
  if v_o.status not in ('awaiting_payment', 'payment_submitted') then raise exception 'shop:bad_status:%', v_o.status; end if;
  if exists (select 1 from shop.orders where utr = v_utr and id <> v_o.id and status <> 'cancelled') then
    raise exception 'shop:utr_used';
  end if;
  update shop.orders set utr = v_utr, status = 'payment_submitted', payment_submitted_at = now(), expires_at = null
   where id = v_o.id returning * into v_o;
  insert into shop.order_events (order_id, status, actor, actor_role, note)
  values (v_o.id, 'payment_submitted', auth.uid(), 'buyer', 'UPI reference ' || v_utr || ' submitted; awaiting confirmation.');
  return shop.order_json(v_o, false);
end $$;

create function public.shop_cancel_order(p_order_no text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_o shop.orders;
begin
  if auth.uid() is null then raise exception 'shop:sign_in_required'; end if;
  select * into v_o from shop.orders where order_no = p_order_no and user_id = auth.uid() for update;
  if v_o.id is null then raise exception 'shop:not_found'; end if;
  if v_o.status <> 'awaiting_payment' then raise exception 'shop:bad_status:%', v_o.status; end if;
  update shop.orders set status = 'cancelled', cancelled_at = now(), expires_at = null where id = v_o.id returning * into v_o;
  perform shop.release_order(v_o.id, false);
  insert into shop.order_events (order_id, status, actor, actor_role, note)
  values (v_o.id, 'cancelled', auth.uid(), 'buyer', 'Cancelled by the buyer before paying.');
  return shop.order_json(v_o, false);
end $$;

-- ---------- admin ----------

create function public.shop_is_admin() returns boolean language sql stable security invoker set search_path = '' as $$
  select shop.is_admin()
$$;

create function public.shop_admin_products() returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not shop.is_admin() then raise exception 'shop:not_admin' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(shop.product_json(p) order by p.for_sale desc, p.on_site desc, p.title)
                   from shop.products p), '[]'::jsonb);
end $$;

-- Price, availability and physical details of one artwork. Runs as the caller: RLS lets only admins update.
create function public.shop_admin_save_product(p jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v shop.products;
begin
  if not shop.is_admin() then raise exception 'shop:not_admin' using errcode = '42501'; end if;
  update shop.products set
    price_inr = nullif(p ->> 'price_inr', '')::numeric::integer,
    for_sale = coalesce((p ->> 'for_sale')::boolean, false),
    sold = coalesce((p ->> 'sold')::boolean, sold),
    medium = nullif(trim(p ->> 'medium'), ''),
    width_cm = nullif(p ->> 'width_cm', '')::numeric, height_cm = nullif(p ->> 'height_cm', '')::numeric,
    depth_cm = nullif(p ->> 'depth_cm', '')::numeric, weight_kg = nullif(p ->> 'weight_kg', '')::numeric
  where artwork_id = p ->> 'id' returning * into v;
  if v.artwork_id is null then raise exception 'shop:not_found'; end if;
  return shop.product_json(v);
end $$;

-- Copies titles, categories and certificate numbers from the main site's data.js. Never touches price,
-- for_sale, sold or the physical details. Artworks no longer on the site are flagged, not deleted.
create function public.shop_admin_import(p_rows jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_new integer; v_total integer; v_gone integer;
begin
  if not shop.is_admin() then raise exception 'shop:not_admin' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'shop:bad_import'; end if;
  select count(*) into v_new from jsonb_array_elements(p_rows) r
   where not exists (select 1 from shop.products p where p.artwork_id = r ->> 'id');
  insert into shop.products (artwork_id, title, category, cert, on_site)
  select r ->> 'id', r ->> 'title', coalesce(r ->> 'cat', 'paintings'), nullif(r ->> 'cert', ''), true
    from jsonb_array_elements(p_rows) r
  on conflict (artwork_id) do update set title = excluded.title, category = excluded.category,
    cert = coalesce(excluded.cert, shop.products.cert), on_site = true
  where (shop.products.title, shop.products.category, shop.products.cert, shop.products.on_site)
        is distinct from (excluded.title, excluded.category, coalesce(excluded.cert, shop.products.cert), true);
  update shop.products set on_site = false
   where on_site and artwork_id not in (select r ->> 'id' from jsonb_array_elements(p_rows) r);
  get diagnostics v_gone = row_count;
  select count(*) into v_total from shop.products;
  return jsonb_build_object('received', jsonb_array_length(p_rows), 'added', v_new, 'removed_from_site', v_gone, 'total', v_total);
end $$;

create function public.shop_admin_orders(p_status text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not shop.is_admin() then raise exception 'shop:not_admin' using errcode = '42501'; end if;
  perform shop.expire_stale();
  return coalesce((select jsonb_agg(jsonb_build_object('order_no', o.order_no, 'status', o.status, 'total_inr', o.total_inr,
      'created_at', o.created_at, 'name', o.ship_to ->> 'name', 'city', o.ship_to ->> 'city', 'pin', o.ship_to ->> 'pin',
      'pickup', o.pickup, 'utr', o.utr, 'buyer_email', o.buyer_email,
      'titles', (select string_agg(i.title, ', ' order by i.title) from shop.order_items i where i.order_id = o.id))
      order by o.created_at desc)
    from shop.orders o where p_status is null or p_status = '' or o.status::text = p_status), '[]'::jsonb);
end $$;

-- Moves an order along: mark_paid, ship, deliver, cancel, or note. Every change is logged in order_events.
create function public.shop_admin_update_order(p_order_no text, p_action text, p jsonb default '{}'::jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_o shop.orders; v_was_paid boolean; v_note text := nullif(trim(p ->> 'note'), '');
begin
  if not shop.is_admin() then raise exception 'shop:not_admin' using errcode = '42501'; end if;
  perform shop.expire_stale();
  select * into v_o from shop.orders where order_no = p_order_no for update;
  if v_o.id is null then raise exception 'shop:not_found'; end if;

  if p_action = 'mark_paid' then
    if v_o.status not in ('awaiting_payment', 'payment_submitted') then raise exception 'shop:bad_status:%', v_o.status; end if;
    update shop.orders set status = 'paid', paid_at = now(), expires_at = null,
      utr = coalesce(nullif(regexp_replace(coalesce(p ->> 'utr', ''), '\s', '', 'g'), ''), utr)
     where id = v_o.id returning * into v_o;
    update shop.products set sold = true where artwork_id in (select artwork_id from shop.order_items where order_id = v_o.id and active);
    v_note := coalesce(v_note, 'Payment received and confirmed.');
  elsif p_action = 'ship' then
    if v_o.status <> 'paid' or v_o.pickup then raise exception 'shop:bad_status:%', v_o.status; end if;
    if coalesce(trim(p ->> 'courier'), '') = '' or coalesce(trim(p ->> 'tracking_no'), '') = '' then
      raise exception 'shop:tracking_required';
    end if;
    update shop.orders set status = 'shipped', shipped_at = now(), courier = trim(p ->> 'courier'),
      tracking_no = trim(p ->> 'tracking_no'), tracking_url = nullif(trim(p ->> 'tracking_url'), '')
     where id = v_o.id returning * into v_o;
    v_note := coalesce(v_note, 'Dispatched with ' || v_o.courier || ', tracking ' || v_o.tracking_no || '.');
  elsif p_action = 'deliver' then
    if not (v_o.status = 'shipped' or (v_o.status = 'paid' and v_o.pickup)) then raise exception 'shop:bad_status:%', v_o.status; end if;
    update shop.orders set status = 'delivered', delivered_at = now() where id = v_o.id returning * into v_o;
    v_note := coalesce(v_note, case when v_o.pickup then 'Collected.' else 'Delivered.' end);
  elsif p_action = 'cancel' then
    if v_o.status not in ('awaiting_payment', 'payment_submitted', 'paid') then raise exception 'shop:bad_status:%', v_o.status; end if;
    v_was_paid := v_o.status = 'paid';
    if v_was_paid and v_note is null then raise exception 'shop:note_required'; end if;
    update shop.orders set status = 'cancelled', cancelled_at = now(), expires_at = null where id = v_o.id returning * into v_o;
    perform shop.release_order(v_o.id, v_was_paid);
    v_note := coalesce(v_note, 'Cancelled by the seller.');
  elsif p_action = 'note' then
    if v_note is null then raise exception 'shop:note_required'; end if;
    update shop.orders set admin_note = v_note where id = v_o.id returning * into v_o;
    insert into shop.order_events (order_id, status, actor, actor_role, note) values (v_o.id, null, auth.uid(), 'admin', v_note);
    return shop.order_json(v_o, true);
  else
    raise exception 'shop:bad_action';
  end if;
  insert into shop.order_events (order_id, status, actor, actor_role, note) values (v_o.id, v_o.status, auth.uid(), 'admin', v_note);
  return shop.order_json(v_o, true);
end $$;

create function public.shop_admin_settings() returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not shop.is_admin() then raise exception 'shop:not_admin' using errcode = '42501'; end if;
  return (select jsonb_object_agg(key, value) from shop.settings)
         || jsonb_build_object('quote_signing', shop.quote_signing_enabled());
end $$;

create function public.shop_admin_save_settings(p jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare k text; v text;
begin
  if not shop.is_admin() then raise exception 'shop:not_admin' using errcode = '42501'; end if;
  for k, v in select key, nullif(trim(value), '') from jsonb_each_text(p) loop
    if k not in ('upi_vpa', 'upi_payee_name', 'pickup_prefixes', 'pickup_note', 'payment_window_hours') then
      raise exception 'shop:bad_setting:%', k;
    end if;
    if k = 'upi_vpa' and v is not null and v !~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$' then raise exception 'shop:bad_vpa'; end if;
    if k = 'pickup_prefixes' and v is not null and replace(v, ' ', '') !~ '^[1-9][0-9]{0,5}(,[1-9][0-9]{0,5})*$' then raise exception 'shop:bad_prefixes'; end if;
    if k = 'payment_window_hours' and (v is null or v !~ '^[0-9]+$' or v::int not between 1 and 168) then raise exception 'shop:bad_window'; end if;
    if k = 'upi_payee_name' and (v is null or length(v) > 60) then raise exception 'shop:bad_payee'; end if;
    update shop.settings set value = case when k = 'pickup_prefixes' then replace(v, ' ', '') else v end where key = k;
  end loop;
  return public.shop_admin_settings();
end $$;

-- ---------- who may call what ----------
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'shop\_%' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.shop_settings(), public.shop_products(text[]) to anon;

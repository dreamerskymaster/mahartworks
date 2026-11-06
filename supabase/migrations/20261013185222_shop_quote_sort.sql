-- The signed shipping quote lists the artwork ids sorted. JavaScript sorts by code point; the database's default
-- collation ignores hyphens, so 'a-b' and 'ab' could sort differently and a valid quote would be refused.
-- Sort bytewise (collate "C") to match shop/public/js/lib/quote.js.
create or replace function shop.api_place_order(p_items text[], p_address_id uuid, p_shipping jsonb,
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
  select array_agg(distinct x collate "C" order by x collate "C") into v_ids from unnest(p_items) x where x is not null;
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

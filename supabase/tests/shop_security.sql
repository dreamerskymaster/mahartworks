-- Security tests for the shop schema. Run against the real project (MCP execute_sql, or psql as postgres):
-- the whole thing is ONE DO block that ends by raising 'SHOP SQL TESTS PASSED (n)', which rolls back every
-- test row (users, products, orders, vault key). The order-number sequence is not transactional, so it is
-- reset by hand before the final raise. Any failed check raises a different message: that's a failure.
-- It never reads the owner's private tables; it only checks their RLS/policy state in the catalog.
do $tests$
declare
  a uuid := '00000000-0000-4000-8000-0000000000a1';
  b uuid := '00000000-0000-4000-8000-0000000000b2';
  c uuid := '00000000-0000-4000-8000-0000000000c3';   -- admin
  seq_last bigint; seq_called boolean;
  addr_a uuid; addr_b uuid; addr_b2 uuid;
  o jsonb; o2 jsonb; ord_a text; ord_b text; n int; t text; ok boolean;
  exp bigint; msg text; sig text;
  passed int := 0;
begin
  select last_value, is_called into seq_last, seq_called from shop.order_no_seq;

  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email, aud, role) values
    (a, 'buyer-a@example.test', 'authenticated', 'authenticated'),
    (b, 'buyer-b@example.test', 'authenticated', 'authenticated'),
    (c, 'admin-c@example.test', 'authenticated', 'authenticated');
  insert into shop.admins (user_id, note) values (c, 'test admin');
  insert into shop.products (artwork_id, title, category, cert, price_inr, for_sale, sold, weight_kg) values
    ('zz-test-priced', 'Test Priced', 'paintings', 'MS-2026-9001', 5000, true, false, 1.2),
    ('zz-test-unpriced', 'Test Unpriced', 'paintings', 'MS-2026-9002', null, false, false, null),
    ('zz-test-sold', 'Test Sold', 'paintings', 'MS-2026-9003', 4000, true, true, 1),
    ('zz-test-second', 'Test Second', 'drawings', 'MS-2026-9004', 3000, true, false, 0.5);
  update shop.settings set value = 'test-vpa@upi' where key = 'upi_vpa';

  -- ---------- anon ----------
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from shop.products where artwork_id like 'zz-test-%';
  assert n = 3, 'anon sees priced/sold products only, got ' || n;
  select count(*) into n from shop.products where artwork_id = 'zz-test-unpriced';
  assert n = 0, 'anon must not see an unpriced product';
  o := public.shop_products(array['zz-test-priced', 'zz-test-unpriced', 'zz-test-sold']);
  assert jsonb_array_length(o) = 2, 'shop_products hides unpriced, got ' || o::text;
  o := public.shop_settings();
  assert (o ->> 'payments_open')::boolean, 'payments open once a VPA is set';
  assert o::text not like '%test-vpa%', 'public settings must not reveal the UPI ID';
  begin perform count(*) from shop.orders; raise exception 'anon read orders';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from shop.addresses; raise exception 'anon read addresses';
  exception when insufficient_privilege then null; end;
  select count(*) into n from shop.settings where key = 'upi_vpa'; assert n = 0, 'anon read the private VPA row';
  begin perform public.shop_place_order(array['zz-test-priced'], gen_random_uuid(), '{"code":"pickup"}'); raise exception 'anon placed an order';
  exception when insufficient_privilege then null; end;
  begin perform public.shop_admin_products(); raise exception 'anon listed admin products';
  exception when insufficient_privilege then null; end;
  reset role;
  passed := passed + 1;

  -- ---------- buyer A: address, order with free pickup ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'email', 'buyer-a@example.test')::text, true);
  set local role authenticated;
  o := public.shop_save_profile('Buyer A', '+91 98765 43210');
  assert o ->> 'name' = 'Buyer A', 'profile saved';
  o := public.shop_save_address('{"name":"Buyer A","phone":"9876543210","line1":"1 Test Road","city":"Mumbai","state":"Maharashtra","pin":"400050","is_default":true}');
  addr_a := (o ->> 'id')::uuid;
  begin perform public.shop_save_address('{"name":"X","phone":"9876543210","line1":"1","city":"London","state":"-","pin":"400050","country":"GB"}');
    raise exception 'foreign address accepted';
  exception when others then assert sqlerrm like 'shop:india_only%', sqlerrm; end;
  o := public.shop_place_order(array['zz-test-priced'], addr_a, '{"code":"pickup","price_inr":999}', 5000, 'Please call first');
  ord_a := o ->> 'order_no';
  assert ord_a ~ '^MSA-[0-9]{4}-[0-9]{5}$', 'order number format: ' || ord_a;
  assert (o ->> 'subtotal_inr')::int = 5000 and (o ->> 'shipping_inr')::int = 0 and (o ->> 'total_inr')::int = 5000,
    'pickup is free whatever the browser says: ' || o::text;
  assert o ->> 'status' = 'awaiting_payment', 'new order awaits payment';
  o := public.shop_order(ord_a);
  assert o -> 'pay' ->> 'vpa' = 'test-vpa@upi', 'the buyer gets the UPI ID for their own unpaid order';
  reset role;
  passed := passed + 1;

  -- ---------- buyer B: isolation and tampering ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'email', 'buyer-b@example.test')::text, true);
  set local role authenticated;
  o := public.shop_save_address('{"name":"Buyer B","phone":"9123456780","line1":"2 Test Lane","city":"New Delhi","state":"Delhi","pin":"110001"}');
  addr_b := (o ->> 'id')::uuid;
  select count(*) into n from shop.orders;            assert n = 0, 'B sees A''s orders (' || n || ')';
  select count(*) into n from shop.order_items;       assert n = 0, 'B sees A''s order items';
  select count(*) into n from shop.order_events;      assert n = 0, 'B sees A''s order events';
  select count(*) into n from shop.addresses;         assert n = 1, 'B sees other addresses (' || n || ')';
  select count(*) into n from shop.profiles;          assert n = 0, 'B sees A''s profile';
  assert jsonb_array_length(public.shop_my_orders()) = 0, 'B''s order history is empty';
  assert jsonb_array_length(public.shop_addresses()) = 1, 'B lists only B''s address';
  begin perform public.shop_order(ord_a); raise exception 'B opened A''s order';
  exception when others then assert sqlerrm = 'shop:not_found', sqlerrm; end;
  begin perform public.shop_submit_utr(ord_a, '123456789012'); raise exception 'B paid A''s order';
  exception when others then assert sqlerrm = 'shop:not_found', sqlerrm; end;
  begin perform public.shop_cancel_order(ord_a); raise exception 'B cancelled A''s order';
  exception when others then assert sqlerrm = 'shop:not_found', sqlerrm; end;
  update shop.addresses set name = 'hijacked' where id = addr_a;
  get diagnostics n = row_count; assert n = 0, 'B edited A''s address';
  begin perform public.shop_save_address(jsonb_build_object('id', addr_a, 'name', 'x', 'phone', '9123456780', 'line1', 'x',
    'city', 'x', 'state', 'x', 'pin', '110001')); raise exception 'B overwrote A''s address';
  exception when others then assert sqlerrm = 'shop:not_found', sqlerrm; end;
  -- one of a kind: A holds it, so nobody else can order it
  begin perform public.shop_place_order(array['zz-test-priced'], addr_b, '{"code":"est:speed-post","price_inr":200}', 5000);
    raise exception 'reserved artwork sold twice';
  exception when others then assert sqlerrm like 'shop:unavailable%', sqlerrm; end;
  begin perform public.shop_place_order(array['zz-test-sold'], addr_b, '{"code":"est:speed-post","price_inr":200}', 4000);
    raise exception 'sold artwork ordered';
  exception when others then assert sqlerrm like 'shop:unavailable%', sqlerrm; end;
  begin perform public.shop_place_order(array['zz-test-unpriced'], addr_b, '{"code":"est:speed-post","price_inr":200}');
    raise exception 'unpriced artwork ordered';
  exception when others then assert sqlerrm like 'shop:unavailable%', sqlerrm; end;
  begin perform public.shop_place_order(array['zz-test-second'], addr_b, '{"code":"est:speed-post","price_inr":200}', 1);
    raise exception 'tampered price accepted';
  exception when others then assert sqlerrm = 'shop:price_changed:3000', sqlerrm; end;
  begin perform public.shop_place_order(array['zz-test-second'], addr_b, '{"code":"pickup"}', 3000);
    raise exception 'free pickup for a Delhi PIN';
  exception when others then assert sqlerrm = 'shop:pickup_not_available', sqlerrm; end;
  begin perform public.shop_place_order(array['zz-test-second'], addr_a, '{"code":"pickup"}', 3000);
    raise exception 'ordered to someone else''s address';
  exception when others then assert sqlerrm = 'shop:bad_address', sqlerrm; end;
  -- non-admin can't change prices or orders
  update shop.products set price_inr = 1 where artwork_id = 'zz-test-second';
  get diagnostics n = row_count; assert n = 0, 'non-admin changed a price';
  begin perform public.shop_admin_save_product('{"id":"zz-test-second","price_inr":1,"for_sale":true}'); raise exception 'non-admin saved a product';
  exception when insufficient_privilege then null; end;
  begin perform public.shop_admin_update_order(ord_a, 'mark_paid'); raise exception 'non-admin marked paid';
  exception when insufficient_privilege then null; end;
  begin perform public.shop_admin_save_settings('{"upi_vpa":"thief@upi"}'); raise exception 'non-admin changed the UPI ID';
  exception when insufficient_privilege then null; end;
  begin insert into shop.orders (order_no, subtotal_inr, shipping_inr, shipping_code, ship_to) values ('MSA-2026-99999', 1, 0, 'pickup', '{}');
    raise exception 'direct order insert';
  exception when insufficient_privilege then null; end;
  begin insert into shop.admins (user_id) values (b); raise exception 'B made itself admin';
  exception when insufficient_privilege then null; end;
  select count(*) into n from shop.settings where key = 'upi_vpa'; assert n = 0, 'non-admin read the UPI ID row';
  reset role;
  passed := passed + 1;

  -- ---------- signed shipping quotes (key in Vault) ----------
  perform vault.create_secret('test-quote-key', 'shop_quote_key', 'test only');
  exp := extract(epoch from now())::bigint + 600;
  msg := concat_ws('|', 'v1', '110001', 'zz-test-second', 'est:speed-post', '180', exp::text);
  sig := encode(extensions.hmac(convert_to(msg, 'UTF8'), convert_to('test-quote-key', 'UTF8'), 'sha256'), 'hex');
  set local role authenticated;
  begin perform public.shop_place_order(array['zz-test-second'], addr_b,
      jsonb_build_object('code', 'est:speed-post', 'price_inr', 1, 'exp', exp, 'sig', sig), 3000);
    raise exception 'cheaper shipping than quoted accepted';
  exception when others then assert sqlerrm = 'shop:shipping_quote_invalid', sqlerrm; end;
  o := public.shop_place_order(array['zz-test-second'], addr_b,
      jsonb_build_object('code', 'est:speed-post', 'price_inr', 180, 'exp', exp, 'sig', sig, 'label', 'Speed Post (estimate)'), 3000);
  ord_b := o ->> 'order_no';
  assert (o ->> 'total_inr')::int = 3180, 'total = price + signed shipping: ' || o::text;
  reset role;
  assert (select o.shipping_verified from shop.orders o where o.order_no = ord_b), 'signed quote marked verified';
  set local role authenticated;
  -- B cancels; the artwork is free again
  o := public.shop_cancel_order(ord_b);
  assert o ->> 'status' = 'cancelled', 'buyer can cancel before paying';
  o := public.shop_products(array['zz-test-second']);
  assert o -> 0 ->> 'status' = 'available', 'cancelled order releases the artwork: ' || o::text;
  reset role;
  passed := passed + 1;

  -- ---------- expiry: an unpaid order lets go after its window ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o := public.shop_place_order(array['zz-test-second'], addr_b,
      jsonb_build_object('code', 'est:speed-post', 'price_inr', 180, 'exp', exp, 'sig', sig), 3000);
  ord_b := o ->> 'order_no';
  reset role;
  update shop.orders set expires_at = now() - interval '1 minute' where order_no = ord_b;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o := public.shop_products(array['zz-test-second']);
  assert o -> 0 ->> 'status' = 'available', 'expired order no longer reserves: ' || o::text;
  perform public.shop_my_orders();   -- runs the lazy expiry
  reset role;
  select status::text into t from shop.orders where order_no = ord_b;
  assert t = 'cancelled', 'expired order cancelled, got ' || t;
  passed := passed + 1;

  -- ---------- UTR ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.shop_submit_utr(ord_a, '12345'); raise exception 'short UTR accepted';
  exception when others then assert sqlerrm = 'shop:bad_utr', sqlerrm; end;
  o := public.shop_submit_utr(ord_a, '1234 5678 9012');
  assert o ->> 'status' = 'payment_submitted' and o ->> 'utr' = '123456789012', 'UTR submitted: ' || o::text;
  select sold into ok from shop.products where artwork_id = 'zz-test-priced';
  assert ok is null or not ok, 'never marked sold before she confirms';
  reset role;
  passed := passed + 1;

  -- ---------- admin ----------
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  assert public.shop_is_admin(), 'admin recognised';
  assert jsonb_array_length(public.shop_admin_orders('payment_submitted')) >= 1, 'admin sees submitted payments';
  o := public.shop_admin_settings();
  assert o ->> 'upi_vpa' = 'test-vpa@upi' and (o ->> 'quote_signing')::boolean, 'admin settings: ' || o::text;
  begin perform public.shop_admin_save_settings('{"upi_vpa":"not a vpa"}'); raise exception 'bad VPA saved';
  exception when others then assert sqlerrm = 'shop:bad_vpa', sqlerrm; end;
  o := public.shop_admin_save_product('{"id":"zz-test-unpriced","price_inr":"7500","for_sale":true,"medium":"Acrylic on canvas","width_cm":"30","height_cm":"40","weight_kg":"0.8"}');
  assert (o ->> 'price_inr')::int = 7500 and (o ->> 'for_sale')::boolean, 'admin priced a product: ' || o::text;
  o := public.shop_admin_import('[{"id":"zz-test-unpriced","title":"Renamed Title","cat":"drawings","cert":"MS-2026-9002"},{"id":"zz-test-new","title":"New One","cat":"crafts","cert":"MS-2026-9005"}]');
  assert (o ->> 'added')::int = 1, 'import added the new artwork: ' || o::text;
  select price_inr, title into n, t from shop.products where artwork_id = 'zz-test-unpriced';
  assert n = 7500 and t = 'Renamed Title', 'import keeps the price and updates the title';
  o := public.shop_admin_import('[{"id":"zz-test-oil","title":"Oil Test","cat":"oils","cert":"MS-2026-9006"},{"id":"zz-test-unpriced","title":"Renamed Title","cat":"oils"}]');
  select medium into t from shop.products where artwork_id = 'zz-test-oil';
  assert t = 'Oil on canvas', 'oil paintings default to Oil on canvas, got ' || coalesce(t, 'null');
  select medium into t from shop.products where artwork_id = 'zz-test-unpriced';
  assert t = 'Acrylic on canvas', 'import never overwrites a medium she typed, got ' || coalesce(t, 'null');
  o := public.shop_admin_update_order(ord_a, 'mark_paid');
  assert o ->> 'status' = 'paid', 'marked paid';
  select sold into ok from shop.products where artwork_id = 'zz-test-priced';
  assert ok, 'paid order marks the artwork sold';
  begin perform public.shop_admin_update_order(ord_a, 'ship', '{"courier":"X","tracking_no":"1"}'); raise exception 'pickup order shipped';
  exception when others then assert sqlerrm like 'shop:bad_status%', sqlerrm; end;
  o := public.shop_admin_update_order(ord_a, 'deliver');
  assert o ->> 'status' = 'delivered' and jsonb_array_length(o -> 'events') = 4, 'delivered with a full trail: ' || o::text;
  reset role;
  -- the buyer sees the timeline but not the admin-only fields
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o := public.shop_order(ord_a);
  assert o ->> 'status' = 'delivered' and not (o ? 'admin_note') and not (o ? 'pay'), 'buyer view of a finished order: ' || o::text;
  reset role;
  passed := passed + 1;

  -- ---------- the owner's private tables stay locked ----------
  select bool_and(c2.relrowsecurity) into ok from pg_class c2 join pg_namespace s on s.oid = c2.relnamespace
   where (s.nspname, c2.relname) in (('personal', 'email_cleanup_log'), ('public', 'job_outreach'));
  assert ok, 'private tables keep RLS on';
  select count(*) into n from pg_policies where (schemaname, tablename) in (('personal', 'email_cleanup_log'), ('public', 'job_outreach'));
  assert n = 0, 'private tables still have no policies';
  -- no SECURITY DEFINER function left in public under the shop_ prefix
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname like 'shop\_%' and p.prosecdef;
  assert n = 0, n || ' SECURITY DEFINER shop_ functions in public';
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'shop' and p.prosecdef and not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%');
  assert n = 0, n || ' definer functions without a fixed search_path';
  passed := passed + 1;

  perform setval('shop.order_no_seq', seq_last, seq_called);
  raise exception 'SHOP SQL TESTS PASSED (% groups)', passed;
end
$tests$;

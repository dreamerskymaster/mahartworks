-- Advisor fix (lints 0028/0029): no SECURITY DEFINER function stays in the exposed `public` schema.
-- Each one moves to the private `shop` schema as shop.api_<name>, and `public.shop_<name>` becomes a thin
-- SECURITY INVOKER wrapper with the same signature. The checks inside (auth.uid(), shop.is_admin()) are
-- unchanged; the caller still needs EXECUTE on both, granted to the same roles as before.

alter function public.shop_settings() set schema shop;
alter function shop.shop_settings() rename to api_settings;
alter function public.shop_products(text[]) set schema shop;
alter function shop.shop_products(text[]) rename to api_products;
alter function public.shop_place_order(text[], uuid, jsonb, integer, text) set schema shop;
alter function shop.shop_place_order(text[], uuid, jsonb, integer, text) rename to api_place_order;
alter function public.shop_my_orders() set schema shop;
alter function shop.shop_my_orders() rename to api_my_orders;
alter function public.shop_order(text) set schema shop;
alter function shop.shop_order(text) rename to api_order;
alter function public.shop_submit_utr(text, text) set schema shop;
alter function shop.shop_submit_utr(text, text) rename to api_submit_utr;
alter function public.shop_cancel_order(text) set schema shop;
alter function shop.shop_cancel_order(text) rename to api_cancel_order;
alter function public.shop_admin_orders(text) set schema shop;
alter function shop.shop_admin_orders(text) rename to api_admin_orders;
alter function public.shop_admin_update_order(text, text, jsonb) set schema shop;
alter function shop.shop_admin_update_order(text, text, jsonb) rename to api_admin_update_order;

create function public.shop_settings() returns jsonb language sql stable security invoker set search_path = '' as $$
  select shop.api_settings() $$;
create function public.shop_products(p_ids text[] default null) returns jsonb language sql stable security invoker set search_path = '' as $$
  select shop.api_products(p_ids) $$;
create function public.shop_place_order(p_items text[], p_address_id uuid, p_shipping jsonb,
                                        p_expected_subtotal integer default null, p_note text default null)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shop.api_place_order(p_items, p_address_id, p_shipping, p_expected_subtotal, p_note) $$;
create function public.shop_my_orders() returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shop.api_my_orders() $$;
create function public.shop_order(p_order_no text) returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shop.api_order(p_order_no) $$;
create function public.shop_submit_utr(p_order_no text, p_utr text) returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shop.api_submit_utr(p_order_no, p_utr) $$;
create function public.shop_cancel_order(p_order_no text) returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shop.api_cancel_order(p_order_no) $$;
create function public.shop_admin_orders(p_status text default null) returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shop.api_admin_orders(p_status) $$;
create function public.shop_admin_update_order(p_order_no text, p_action text, p jsonb default '{}'::jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select shop.api_admin_update_order(p_order_no, p_action, p) $$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname = 'public' and p.proname like 'shop\_%') or (n.nspname = 'shop' and p.proname like 'api\_%') loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.shop_settings(), public.shop_products(text[]),
  shop.api_settings(), shop.api_products(text[]) to anon;

-- Advisor fix (lint 0006): one SELECT policy on profiles instead of two.
drop policy profiles_own on shop.profiles;
drop policy profiles_admin_read on shop.profiles;
create policy profiles_read on shop.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select shop.is_admin()));
create policy profiles_insert on shop.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_update on shop.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profiles_delete on shop.profiles for delete to authenticated using (user_id = (select auth.uid()));

-- The gallery gained an `oils` category ("Oil Paintings", PR #7). Import gives oil paintings the medium
-- "Oil on canvas" when she hasn't entered one; it never overwrites a medium she typed.
create or replace function public.shop_admin_import(p_rows jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_new integer; v_total integer; v_gone integer;
begin
  if not shop.is_admin() then raise exception 'shop:not_admin' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'shop:bad_import'; end if;
  select count(*) into v_new from jsonb_array_elements(p_rows) r
   where not exists (select 1 from shop.products p where p.artwork_id = r ->> 'id');
  insert into shop.products (artwork_id, title, category, cert, medium, on_site)
  select r ->> 'id', r ->> 'title', coalesce(r ->> 'cat', 'paintings'), nullif(r ->> 'cert', ''),
         case when r ->> 'cat' = 'oils' then 'Oil on canvas' end, true
    from jsonb_array_elements(p_rows) r
  on conflict (artwork_id) do update set title = excluded.title, category = excluded.category,
    cert = coalesce(excluded.cert, shop.products.cert), on_site = true,
    medium = coalesce(shop.products.medium, excluded.medium)
  where (shop.products.title, shop.products.category, shop.products.cert, shop.products.on_site, shop.products.medium)
        is distinct from (excluded.title, excluded.category, coalesce(excluded.cert, shop.products.cert), true,
                          coalesce(shop.products.medium, excluded.medium));
  update shop.products set on_site = false
   where on_site and artwork_id not in (select r ->> 'id' from jsonb_array_elements(p_rows) r);
  get diagnostics v_gone = row_count;
  select count(*) into v_total from shop.products;
  return jsonb_build_object('received', jsonb_array_length(p_rows), 'added', v_new, 'removed_from_site', v_gone, 'total', v_total);
end $$;

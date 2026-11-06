-- PostgreSQL caps a regex repeat count at 255, so the UPI ID check '{2,256}' raised an error instead of
-- validating (found by supabase/tests/shop_security.sql).
create or replace function public.shop_admin_save_settings(p jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare k text; v text;
begin
  if not shop.is_admin() then raise exception 'shop:not_admin' using errcode = '42501'; end if;
  for k, v in select key, nullif(trim(value), '') from jsonb_each_text(p) loop
    if k not in ('upi_vpa', 'upi_payee_name', 'pickup_prefixes', 'pickup_note', 'payment_window_hours') then
      raise exception 'shop:bad_setting:%', k;
    end if;
    if k = 'upi_vpa' and v is not null and v !~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$' then raise exception 'shop:bad_vpa'; end if;
    if k = 'pickup_prefixes' and v is not null and replace(v, ' ', '') !~ '^[1-9][0-9]{0,5}(,[1-9][0-9]{0,5})*$' then raise exception 'shop:bad_prefixes'; end if;
    if k = 'payment_window_hours' and (v is null or v !~ '^[0-9]+$' or v::int not between 1 and 168) then raise exception 'shop:bad_window'; end if;
    if k = 'upi_payee_name' and (v is null or length(v) > 60) then raise exception 'shop:bad_payee'; end if;
    update shop.settings set value = case when k = 'pickup_prefixes' then replace(v, ' ', '') else v end where key = k;
  end loop;
  return public.shop_admin_settings();
end $$;

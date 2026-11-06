-- Certificate numbers follow site/js/certificate.js (CERT_PATTERN /^MS-\d{4}-\d{4,}$/): allow more than
-- 4 digits once she passes 9,999 works in a year.
alter table shop.products drop constraint products_cert_check;
alter table shop.products add constraint products_cert_check check (cert is null or cert ~ '^MS-[0-9]{4}-[0-9]{4,}$');

// POST /api/shipping-quote  {pin, items: [artwork ids]}  ->  {pickup, options[], source, package}
// Logic lives in shop/server/quote.js (tested in tests/shop/unit.test.mjs).
import { handle } from "../../server/quote.js";

export const onRequest = ({ request, env }) => handle(request, env);

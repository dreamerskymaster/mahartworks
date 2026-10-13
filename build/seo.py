"""Pages for search engines and AI answer engines, generated from site/data.js.

    python3 build/seo.py          # also runs at the end of build/build.py, so new uploads get pages

The gallery is drawn by JavaScript and opens artworks via #art/<id>, which crawlers barely see.
This writes plain HTML they can read, all from data.js (never edit the outputs by hand):
  site/art/<id>.html          one page per artwork (served at /art/<id>); pages of removed artworks are deleted
  site/<category>.html        paintings, drawings, mandalas, rangoli, crafts (served at /paintings etc.)
  site/404.html               so a removed artwork's address answers "not found" instead of the home page
  site/verify.html            /verify: look up a Certificate of Authenticity number (js/verify.js reads data.js)
  site/_redirects             /verify/<number> -> /art/<id>#certificate for every certificate (Cloudflare Pages)
  site/sitemap.xml            every page, with <lastmod> and image entries
  site/llms.txt, llms-full.txt  a plain-text summary for AI assistants (llmstxt.org)
  site/index.html             only between the <!-- seo:… --> markers: newest artworks and category links
Output depends only on the inputs (no clock), so re-running with the same data changes nothing.
"""
import html, json, os, re, sys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "site")
BASE = "https://mah-artworks.pages.dev"
ARTIST = "Mahalakshmi Srikanth"
SITE_NAME = "Mahalakshmi Srikanth Art"
PLACE = "Mumbai, India"
VERIFY = BASE + "/verify/"      # + certificate number: what the QR code on a printed certificate opens
MAX_REDIRECTS = 1900            # Cloudflare Pages allows 2,000 static rules; past that /verify/* -> the lookup page
LATEST = 24          # newest artworks listed on the home page for crawlers
RELATED = 6

# key, label (as in the gallery chips), one artwork (singular), schema.org artform, page <title>, intro
CATEGORIES = [
    ("paintings", "Paintings", "Painting", "Painting",
     "Paintings by Mahalakshmi Srikanth, Mumbai Artist",
     "Paintings on canvas, glass and stone: Ganesha, Krishna and Radha, Indian folk art such as Madhubani and Warli, "
     "landscapes, sunsets and abstracts."),
    ("drawings", "Drawings & Sketches", "Drawing", "Drawing",
     "Drawings & Sketches by Mahalakshmi Srikanth, Mumbai",
     "Pencil sketches, line drawings, doodles and zentangle patterns in sketch pen and crayon, many from her sketchbook."),
    ("mandalas", "Mandalas", "Mandala", "Mandala art",
     "Mandala Art by Mahalakshmi Srikanth, Mumbai",
     "Hand-drawn mandalas: intricate circular patterns, in colour and in black and white."),
    ("rangoli", "Rangoli & Kolam", "Rangoli", "Rangoli",
     "Rangoli & Kolam Designs by Mahalakshmi Srikanth, Mumbai",
     "Rangoli and kolam made for festivals and special days, such as Diwali, Onam, Pongal and Navratri. "
     "Rangoli is temporary floor art; similar designs can be made on request."),
    ("crafts", "Crafts", "Craft", "Craft",
     "Handmade Crafts by Mahalakshmi Srikanth, Mumbai",
     "Handmade crafts: mirror work, embroidery, painted plates, diya holders, door hangings and best-out-of-waste pieces."),
]
CAT = {c[0]: dict(zip(("key", "label", "one", "artform", "title", "intro"), c)) for c in CATEGORIES}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
POLICY_LINKS = [("privacy", "Privacy Policy"), ("terms", "Terms &amp; Copyright"), ("orders", "Orders &amp; Commissions"),
                ("shipping", "Shipping &amp; Returns"), ("grievance", "Grievance Officer"), ("accessibility", "Accessibility")]

e = lambda s: html.escape(str(s), quote=True)
CURRENT = ' aria-current="page"'


def artworks(site=SITE):
    s = open(os.path.join(site, "data.js"), encoding="utf-8").read()
    return json.loads(s.split("=", 1)[1].strip().rstrip(";"))


def contact(site=SITE):
    """Email and Instagram from CONTACT in app.js (the one place they are set)."""
    js = open(os.path.join(site, "app.js"), encoding="utf-8").read()
    get = lambda k: (re.search(k + r'\s*:\s*"([^"]*)"', js) or [None, ""])[1]
    return {"email": get("email"), "instagram": get("instagram")}


def month(d):
    return f"{MONTHS[int(d[5:7]) - 1]} {d[:4]}" if d else ""


def ld(obj):
    """JSON-LD for a <script> block (the CSP allows it; "</" is escaped so text can't close the tag)."""
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>"


def labels(art):
    """A unique name per artwork for <title>: repeated titles get (2), (3)… in id order."""
    groups, out = {}, {}
    for a in art:
        groups.setdefault(a["title"].strip().lower(), []).append(a)
    for g in groups.values():
        for i, a in enumerate(sorted(g, key=lambda a: (len(a["id"]), a["id"]))):
            out[a["id"]] = a["title"] if i == 0 else f"{a['title']} ({i + 1})"
    return out


def enquiry(email, a):
    if not email:
        return ""
    subject = f"Enquiry: {a['title']} (ID {a['id']})"
    body = f"Hello,\n\nI would like to know more about \"{a['title']}\" ({BASE}/art/{a['id']}).\n\n"
    return f"mailto:{email}?subject={quote(subject)}&body={quote(body)}"


# ---------- shared page frame ----------

def head(*, title, description, path, image=None, image_alt="", w=1200, h=630, og_type="website", data=None, noindex=False):
    url = BASE + path if path else None
    image = image or BASE + "/og.jpg"
    out = ["<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
           f"<title>{e(title)}</title>", f'<meta name="description" content="{e(description)}">']
    if noindex:
        out.append('<meta name="robots" content="noindex">')
    if url:
        out += [f'<link rel="canonical" href="{e(url)}">', f'<meta property="og:url" content="{e(url)}">']
    out += [f'<meta property="og:type" content="{og_type}">', f'<meta property="og:site_name" content="{SITE_NAME}">',
            f'<meta property="og:title" content="{e(title)}">', f'<meta property="og:description" content="{e(description)}">',
            f'<meta property="og:image" content="{e(image)}">', f'<meta property="og:image:width" content="{w}">',
            f'<meta property="og:image:height" content="{h}">']
    if image_alt:
        out.append(f'<meta property="og:image:alt" content="{e(image_alt)}">')
    out += ['<meta name="twitter:card" content="summary_large_image">', f'<meta name="twitter:title" content="{e(title)}">',
            f'<meta name="twitter:description" content="{e(description)}">', f'<meta name="twitter:image" content="{e(image)}">']
    if image_alt:
        out.append(f'<meta name="twitter:image:alt" content="{e(image_alt)}">')
    out += [f'<meta name="author" content="{ARTIST}">',
            '<meta name="theme-color" content="#0d0f1c" media="(prefers-color-scheme: dark)">',
            '<meta name="theme-color" content="#faf6ee" media="(prefers-color-scheme: light)">',
            '<link rel="icon" href="/icons/icon-192.png" type="image/png">',
            '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
            '<link rel="manifest" href="/manifest.webmanifest">']
    if data:
        out.append(ld(data))
    out += ['<link rel="stylesheet" href="/fonts/fonts.css">', '<script src="/prefs.js"></script>',
            '<link rel="stylesheet" href="/style.css">', "</head>", "<body>",
            '<a class="skip" href="#main">Skip to content</a>',
            '<header class="nav solid">',
            f'  <a class="brand" href="/"><img src="/seal.png" alt="" width="36" height="34"><span>{ARTIST}</span>'
            '<span class="sr-only"> — home</span></a>',
            '  <nav class="menu menu-inline" aria-label="Main"><a href="/#gallery">Gallery</a><a href="/#about">About</a>'
            '<a href="/#contact">Contact</a></nav>',
            '  <div class="nav-tools"></div>', "</header>"]
    return "\n".join(out)


def browse_links(art, current=None):
    n = count(art)
    items = "".join(f'<li><a href="/{k}"{CURRENT if k == current else ""}>{e(CAT[k]["label"])}</a></li>'
                    for k in CAT if n.get(k))
    return f'<nav aria-label="Browse the collection"><ul class="foot-links foot-cats">{items}</ul></nav>'


def foot(art, year, current=None):
    pol = "\n".join(f'    <li><a href="/policies#{k}">{v}</a></li>' for k, v in POLICY_LINKS)
    return f"""<footer>
  <img src="/seal.png" alt="" width="64" height="60">
  {browse_links(art, current)}
  <p>© <span id="year">{year}</span> {ARTIST}. All rights reserved.</p>
  <p class="small">All artworks and images on this site are the original work of {ARTIST} and are protected by copyright. They may not be copied, downloaded, reproduced or used in any form without written permission.</p>
  <ul class="foot-links">
{pol}
  </ul>
  <p class="love">Made by Ajith, for his only loving Mom <span class="heart" aria-hidden="true">♥</span></p>
</footer>
</body>
</html>
"""


def crumbs(trail):
    """trail: [(name, path or None)] — the last one is the current page."""
    li = "".join(f'<li><a href="{p}">{e(n)}</a></li>' if p else f'<li aria-current="page">{e(n)}</li>' for n, p in trail)
    return f'<nav class="crumbs" aria-label="Breadcrumb"><ol>{li}</ol></nav>'


def crumbs_ld(trail):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, **({"item": BASE + p} if p else {})}
        for i, (n, p) in enumerate(trail)]}


def tiles(items, cls="tiles"):
    li = "".join(f'<li><a href="/art/{a["id"]}"><img src="/img/{a["id"]}.t.webp" alt="" width="{a["w"]}" height="{a["h"]}" '
                 f'loading="lazy" decoding="async"><span>{e(a["title"])}</span></a></li>' for a in items)
    return f'<ul class="{cls}">{li}</ul>'


def count(art):
    n = {}
    for a in art:
        n[a["cat"]] = n.get(a["cat"], 0) + 1
    return n


PERSON = {"@type": "Person", "@id": BASE + "/#person", "name": ARTIST, "url": BASE + "/", "jobTitle": "Artist"}
ME = {"@id": PERSON["@id"]}            # the Person node is in each page's @graph once; everything else refers to it


# ---------- pages ----------

def art_page(a, art, label, by_cat, email, year):
    c = CAT[a["cat"]]
    path, img = f"/art/{a['id']}", f"{BASE}/img/{a['id']}.webp"
    when = month(a["date"])
    alt = f"{a['title']} — {c['one'].lower()} by {ARTIST}"
    desc = (f"{label}, {('an original ' + c['one'].lower()) if a['cat'] != 'rangoli' else 'a rangoli'} by {ARTIST}, "
            f"an artist in {PLACE}" + (f" ({when})" if when else "") + ". See it in her gallery, or enquire about it or a commission.")
    trail = [("Home", "/"), (c["label"], f"/{c['key']}"), (a["title"], None)]
    work = {"@type": "VisualArtwork", "@id": BASE + path + "#artwork", "name": a["title"], "url": BASE + path,
            "image": {"@type": "ImageObject", "contentUrl": img, "width": a["w"], "height": a["h"],
                      "thumbnailUrl": f"{BASE}/img/{a['id']}.t.webp", "creditText": ARTIST,
                      "copyrightNotice": f"© {ARTIST}", "creator": ME},
            "artform": c["artform"], "creator": ME, "copyrightHolder": ME,
            "identifier": [a["id"]] + ([{"@type": "PropertyValue", "propertyID": "Certificate of Authenticity",
                                         "value": a["cert"], "url": VERIFY + a["cert"]}] if a.get("cert") else []),
            "isPartOf": {"@type": "CollectionPage", "@id": f"{BASE}/{c['key']}", "name": c["label"]},
            "locationCreated": {"@type": "Place", "name": PLACE}}
    if a["date"]:
        work["dateCreated"] = a["date"]
    data = {"@context": "https://schema.org", "@graph": [work, PERSON, crumbs_ld(trail)]}

    group = by_cat[a["cat"]]
    i = group.index(a)
    lo = max(0, min(i - RELATED // 2, len(group) - RELATED - 1))
    related = [x for x in group[lo:lo + RELATED + 1] if x is not a][:RELATED]
    facts = [("Category", f'<a href="/{c["key"]}">{e(c["label"])}</a>')]
    if a["date"]:
        facts.append(("Date", f'<time datetime="{a["date"]}">{when}</time>'))
    facts.append(("Artwork ID", e(a["id"])))
    if a.get("cert"):
        facts.append(("Certificate", f'<a href="#certificate">{e(a["cert"])}</a>'))
    mail = enquiry(email, a)
    cta = (f'<a class="btn btn-solid" href="{e(mail)}">Enquire about this artwork</a>' if mail else "") + \
          f'<a class="btn" href="/#art/{a["id"]}">View in the gallery</a>'
    note = ('<p class="art-note">Rangoli is temporary floor art, shown here for display; a similar design can be made on request.</p>'
            if a["cat"] == "rangoli" else
            '<p class="art-note">An original, handmade in India. How buying and commissions work: '
            '<a href="/policies#orders">orders &amp; commissions</a>.</p>')
    more = (f'<section class="related" aria-labelledby="related-h"><h2 id="related-h">More {e(c["label"].lower())}</h2>'
            f'{tiles(related)}<p class="page-cta"><a class="btn" href="/{c["key"]}">All {len(group)} '
            f'{e(c["label"].lower())}</a></p></section>') if related else ""
    body = f"""
<main id="main" class="page art-page">
  {crumbs(trail)}
  <article class="art-detail">
    <figure class="art-figure"><img src="/img/{a['id']}.webp" alt="{e(alt)}" width="{a['w']}" height="{a['h']}" fetchpriority="high" decoding="async" draggable="false"></figure>
    <div class="art-info">
      <p class="eyebrow">{e(c['one'])}</p>
      <h1>{e(a['title'])}</h1>
      <p class="art-by">by <a href="/">{ARTIST}</a> · {PLACE}</p>
      <dl class="art-facts">{"".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in facts)}</dl>
      <div class="art-cta">{cta}</div>
      {note}
    </div>
  </article>
  {certificate(a, email)}
  {more}
</main>
"""
    return head(title=f"{label} — {c['one']} by {ARTIST}", description=desc, path=path, image=img, image_alt=alt,
                w=a["w"], h=a["h"], og_type="article", data=data) + body + foot(art, year)


def certificate(a, email):
    """The Certificate of Authenticity section of an artwork page (/verify/<number> lands here)."""
    if not a.get("cert"):
        return ""
    ask = (f' If anything about a certificate looks wrong, write to <a href="{e("mailto:" + email + "?subject=" + quote("Certificate check: " + a["cert"]))}">'
           f'{e(email)}</a>.') if email else ""
    return f"""<section class="coa" id="certificate" aria-labelledby="coa-h">
    <img class="coa-seal" src="/seal.png" alt="" width="72" height="68" loading="lazy" decoding="async">
    <div class="coa-text">
      <h2 id="coa-h">Certificate of Authenticity</h2>
      <p class="coa-no">Certificate number <strong>{e(a["cert"])}</strong></p>
      <p>Each original is accompanied by a Certificate of Authenticity signed by the artist. It carries this number,
        her MS seal and a QR code that opens this page.</p>
      <p class="coa-how">To verify a certificate, scan its QR code or enter its number at
        <a href="/verify">mah-artworks.pages.dev/verify</a>: a genuine certificate for this artwork brings you back here.{ask}</p>
    </div>
  </section>"""


def verify_page(art, email, year):
    trail = [("Home", "/"), ("Verify a certificate", None)]
    desc = (f"Check a Certificate of Authenticity issued by {ARTIST}: enter its number (like MS-2024-0007) "
            "to see the original artwork it belongs to.")
    data = {"@context": "https://schema.org", "@graph": [PERSON,
        {"@type": "WebPage", "@id": BASE + "/verify", "url": BASE + "/verify", "name": "Verify a Certificate of Authenticity",
         "description": desc, "author": ME, "isPartOf": {"@type": "WebSite", "@id": BASE + "/#website"}}, crumbs_ld(trail)]}
    write_to = (f' or write to <a href="{e("mailto:" + email + "?subject=" + quote("Certificate check"))}">{e(email)}</a>'
                if email else "")
    body = f"""
<main id="main" class="page cat-page verify-page">
  {crumbs(trail)}
  <header class="cat-head">
    <p class="eyebrow">Certificate of Authenticity</p>
    <h1>Verify a certificate</h1>
    <p class="lede">Every original by {ARTIST} comes with a Certificate of Authenticity signed by her. Its number,
      in the form <strong>MS-YYYY-NNNN</strong>, is printed beside the QR code. Enter it to see the artwork it was issued for.</p>
  </header>
  <div class="verify-box" id="verify" data-email="{e(email)}">
    <label for="cert-input">Certificate number</label>
    <div class="verify-row">
      <input id="cert-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"
        placeholder="MS-2024-0007" aria-describedby="cert-result">
      <button class="btn btn-solid" id="cert-check" type="button">Check</button>
    </div>
    <div class="verify-result" id="cert-result" role="status" aria-live="polite"></div>
  </div>
  <noscript><p class="verify-help">This check needs JavaScript. You can also open
    <strong>mah-artworks.pages.dev/verify/</strong> followed by the number.</p></noscript>
  <p class="verify-help">A certificate is genuine only if its number opens the same artwork that it describes. For any doubt,
    ask through <a href="/#contact">her contact details</a>{write_to}.</p>
</main>
<script src="/data.js" defer></script>
<script src="/js/verify.js" defer></script>
"""
    return head(title=f"Verify a Certificate of Authenticity — {ARTIST}", description=desc, path="/verify",
                data=data) + body + foot(art, year)


def redirects(art):
    """Cloudflare Pages _redirects: each certificate's QR address opens its artwork page."""
    out = ["# Generated by build/seo.py from site/data.js; do not edit.",
           "# /verify/<certificate number> -> the artwork it was issued for. Unknown numbers go to the lookup page."]
    certs = sorted((a["cert"], a["id"]) for a in art if a.get("cert"))
    if len(certs) <= MAX_REDIRECTS:
        out += [f"/verify/{c} /art/{i}#certificate 301" for c, i in certs]
    out += ["/verify/* /verify?n=:splat 302", ""]
    return "\n".join(out)


def category_page(key, art, by_cat, email, year):
    c, items = CAT[key], by_cat[key]
    path = f"/{key}"
    n = count(art)
    desc = f"{len(items)} {c['label'].lower()} by {ARTIST}, an artist in {PLACE}. {c['intro']}"
    trail = [("Home", "/"), (c["label"], None)]
    data = {"@context": "https://schema.org", "@graph": [PERSON,
        {"@type": "CollectionPage", "@id": BASE + path, "url": BASE + path, "name": c["title"], "description": desc,
         "about": c["artform"], "author": ME, "isPartOf": {"@type": "WebSite", "@id": BASE + "/#website"},
         "mainEntity": {"@type": "ItemList", "numberOfItems": len(items), "itemListElement": [
             {"@type": "ListItem", "position": i + 1, "url": f"{BASE}/art/{a['id']}", "name": a["title"]}
             for i, a in enumerate(items)]}},
        crumbs_ld(trail)]}
    chips = "".join(f'<a href="/{k}"{CURRENT if k == key else ""}>{e(CAT[k]["label"])}<small>{n[k]}</small></a>'
                    for k in CAT if n.get(k))
    commission = (f'<a class="btn" href="{e("mailto:" + email + "?subject=" + quote("Commission enquiry"))}">Commission a piece</a>'
                  if email else "")
    body = f"""
<main id="main" class="page cat-page">
  {crumbs(trail)}
  <header class="cat-head">
    <p class="eyebrow">{ARTIST}</p>
    <h1>{e(c['label'])}</h1>
    <p class="lede">{e(c['intro'])}</p>
    <p class="count">{len(items)} artwork{"s" if len(items) != 1 else ""}, newest first</p>
  </header>
  <nav class="cat-nav" aria-label="Categories">{chips}</nav>
  {tiles(items)}
  <p class="page-cta"><a class="btn btn-solid" href="/#gallery">Open the full gallery</a>{commission}</p>
</main>
"""
    return head(title=c["title"], description=desc, path=path, data=data) + body + foot(art, year, key)


def not_found_page(art, year):
    body = """
<main id="main" class="page cat-page">
  <header class="cat-head">
    <p class="eyebrow">Not found</p>
    <h1>This page isn’t here</h1>
    <p class="lede">The artwork may have been renamed or removed. Everything that is on show is in the gallery.</p>
  </header>
  <p class="page-cta"><a class="btn btn-solid" href="/#gallery">Open the gallery</a><a class="btn" href="/">Home</a></p>
</main>
"""
    return head(title=f"Not found — {SITE_NAME}", description="This page could not be found.", path=None,
                noindex=True) + body + foot(art, year)


# ---------- text files for crawlers and AI assistants ----------

def sitemap(art, by_cat, site):
    newest = max((a["date"] for a in art if a["date"]), default="")
    pol = open(os.path.join(site, "policies.html"), encoding="utf-8").read()
    m = re.search(r"Last updated:\s*(\d{1,2}) (\w+) (\d{4})", pol)
    pol_date = f"{m[3]}-{MONTHS.index(m[2]) + 1:02d}-{int(m[1]):02d}" if m and m[2] in MONTHS else ""
    rows = [("/", newest, [BASE + "/og.jpg"]), ("/policies", pol_date, []), ("/verify", "", [])]
    for k in CAT:
        if by_cat.get(k):
            rows.append((f"/{k}", max((a["date"] for a in by_cat[k] if a["date"]), default=""), []))
    rows += [(f"/art/{a['id']}", a["date"], [f"{BASE}/img/{a['id']}.webp"]) for a in art]
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
           'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    for path, d, imgs in rows:
        out.append(f"  <url><loc>{e(BASE + path)}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "")
                   + "".join(f"<image:image><image:loc>{e(i)}</image:loc></image:image>" for i in imgs) + "</url>")
    return "\n".join(out + ["</urlset>", ""])


def her_words(site):
    """Her About text, verbatim, from index.html."""
    idx = open(os.path.join(site, "index.html"), encoding="utf-8").read()
    m = re.search(r'<section id="about".*?</section>', idx, re.S)
    if not m:
        return []
    parts = re.findall(r"<(p|blockquote)(?: class=\"([^\"]*)\")?>(.*?)</\1>", m[0], re.S)
    return [html.unescape(re.sub(r"<[^>]+>", "", t)).strip() for tag, cls, t in parts if "eyebrow" not in (cls or "")]


def llms(art, by_cat, ct, site, full=False):
    n = len(art)
    lines = [f"# {ARTIST} — Art", "",
             f"> {ARTIST} is an artist in Mumbai, India. She makes paintings, drawings and sketches, mandalas, "
             f"rangoli and kolam, and handmade crafts. This website is her portfolio of {n} artworks; "
             "artworks and commissions can be enquired about by email.", "",
             f"- Website: {BASE}/",
             "- Based in: Mumbai, Maharashtra, India",
             "- Making art since 2020: it began as a hobby after COVID, with sketching and crayons, then sketch pens, then acrylics.",
             "- Signature: every picture on the site carries her MS seal watermark."]
    if ct["email"]:
        lines.append(f"- Email: {ct['email']} (enquiries, purchases and commissions; she replies personally)")
    if ct["instagram"]:
        lines.append(f"- Instagram: @{ct['instagram']} (https://instagram.com/{ct['instagram']})")
    lines += ["", "## The collection", ""]
    for k, c in CAT.items():
        if by_cat.get(k):
            lines.append(f"- [{c['label']}]({BASE}/{k}): {len(by_cat[k])} artworks. {c['intro']}")
    lines += ["", "Every artwork has its own page at " + BASE + "/art/<id>, with its title, category, date and an enquiry link.",
              "", "## Buying an artwork or commissioning one", "",
              "- Write by email or Instagram with the artwork's name or ID (shown on each artwork page). Availability, size, medium "
              "and the total price in Indian Rupees are confirmed in writing before payment; payment is by UPI or bank transfer.",
              "- Commissions: share the idea, size and medium for a written quote and timeline; a 50% advance confirms the work.",
              "- Rangoli and kolam are temporary floor art, shown for display; similar designs can be made on request.",
              f"- [Orders & commissions]({BASE}/policies#orders)",
              f"- [Shipping, returns & refunds]({BASE}/policies#shipping)",
              f"- [Terms of use & copyright]({BASE}/policies#terms): the artworks and images are her copyright; "
              "please link to an artwork's page rather than copying the picture.",
              f"- [Privacy policy]({BASE}/policies#privacy)", ""]
    if not full:
        lines += ["## Newest artworks", ""]
        lines += [f"- [{a['title']}]({BASE}/art/{a['id']}): {CAT[a['cat']]['one']}" + (f", {month(a['date'])}" if a["date"] else "")
                  for a in art[:12]]
        lines += ["", "## Optional", "",
                  f"- [Every artwork, with her story in her own words]({BASE}/llms-full.txt)",
                  f"- [Sitemap]({BASE}/sitemap.xml)", ""]
        return "\n".join(lines)
    words = her_words(site)
    if words:
        lines += ["## In her own words", "", "(Quoted from the About section of the website.)", ""]
        lines += [w for p in words for w in (p, "")]
    lines += ["## Every artwork", ""]
    for k, c in CAT.items():
        if by_cat.get(k):
            lines += [f"### {c['label']} ({len(by_cat[k])})", ""]
            lines += [f"- [{a['title']}]({BASE}/art/{a['id']})" + (f": {month(a['date'])}" if a["date"] else "") for a in by_cat[k]]
            lines.append("")
    return "\n".join(lines)


# ---------- the home page blocks ----------

def splice(doc, name, content):
    """Replace what is between <!-- seo:name --> and <!-- /seo:name --> (the markers stay)."""
    pat = re.compile(r"(<!-- seo:%s -->).*?(<!-- /seo:%s -->)" % (name, name), re.S)
    if not pat.search(doc):
        raise SystemExit(f"index.html is missing the <!-- seo:{name} --> … <!-- /seo:{name} --> markers")
    return pat.sub(lambda m: m[1] + "\n" + content + "\n" + m[2], doc)


def home_blocks(doc, art):
    n = count(art)
    cats = " · ".join(f'<a href="/{k}">{e(CAT[k]["label"])}</a>' for k in CAT if n.get(k))
    latest = (f'<noscript><div class="noscript-list"><p>Browse by category: {cats}</p>'
              f'<h3>Newest artworks</h3>{tiles(art[:LATEST])}</div></noscript>')
    doc = splice(doc, "latest", "    " + latest)
    return splice(doc, "browse", "  " + browse_links(art))


# ---------- everything ----------

def write(path, text):
    """Write only when the content changes (keeps file times and git quiet)."""
    if os.path.exists(path) and open(path, encoding="utf-8").read() == text:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return True


def generate(site=SITE):
    art = artworks(site)
    unknown = {a["cat"] for a in art} - set(CAT)
    if unknown:
        raise SystemExit(f"seo.py: no category page for {sorted(unknown)}; add it to CATEGORIES")
    ct = contact(site)
    year = max((a["date"][:4] for a in art if a["date"]), default="")
    by_cat = {k: [a for a in art if a["cat"] == k] for k in CAT}
    names = labels(art)
    changed = 0

    adir = os.path.join(site, "art")
    os.makedirs(adir, exist_ok=True)
    keep = set()
    for a in art:
        keep.add(a["id"] + ".html")
        changed += write(os.path.join(adir, a["id"] + ".html"), art_page(a, art, names[a["id"]], by_cat, ct["email"], year))
    removed = [f for f in os.listdir(adir) if f not in keep]
    for f in removed:                                   # artworks she removed (or renamed) go away
        os.remove(os.path.join(adir, f))

    for k in CAT:
        p = os.path.join(site, k + ".html")
        if by_cat[k]:
            changed += write(p, category_page(k, art, by_cat, ct["email"], year))
        elif os.path.exists(p):
            os.remove(p)
    changed += write(os.path.join(site, "404.html"), not_found_page(art, year))
    changed += write(os.path.join(site, "verify.html"), verify_page(art, ct["email"], year))
    changed += write(os.path.join(site, "_redirects"), redirects(art))
    changed += write(os.path.join(site, "sitemap.xml"), sitemap(art, by_cat, site))
    changed += write(os.path.join(site, "llms.txt"), llms(art, by_cat, ct, site))
    changed += write(os.path.join(site, "llms-full.txt"), llms(art, by_cat, ct, site, full=True))
    idx = os.path.join(site, "index.html")
    changed += write(idx, home_blocks(open(idx, encoding="utf-8").read(), art))
    print(f"seo: {len(art)} artwork pages, {sum(1 for k in CAT if by_cat[k])} category pages "
          f"({changed} files written, {len(removed)} removed)")
    return {"artworks": len(art), "written": changed, "removed": removed}


if __name__ == "__main__":
    generate(sys.argv[1] if len(sys.argv) > 1 else SITE)

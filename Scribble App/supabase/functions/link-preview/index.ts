// Returns what a site publishes about itself — og:image for the tile, plus the
// name of the *site* (not the page). The browser can't do this: fetching an
// arbitrary page cross-origin is blocked by CORS, so it has to happen here.
//
// Note: sites serve a reduced <head> to non-browser user agents. buckmason.com
// sends og:site_name to browsers but not to us, hence the layered fallbacks.
//
// Deploy:  supabase functions deploy link-preview --no-verify-jwt
// Call:    GET /functions/v1/link-preview?url=https://example.com

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const UA = {
  'User-Agent': 'Mozilla/5.0 (compatible; ScribbleBot/1.0; +link-preview)',
  'Accept': 'text/html,application/xhtml+xml',
};

// One pass over every <meta> tag into a lowercased key -> content map.
// Per-key regexes were missing tags depending on attribute order and quoting.
function parseMeta(h: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<meta\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h))) {
    const attrs = m[1];
    const key = attrs.match(/\b(?:property|name|itemprop)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
    const val = attrs.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
    if (!key || !val) continue;
    const k = (key[1] ?? key[2] ?? key[3] ?? '').trim().toLowerCase();
    const v = (val[1] ?? val[2] ?? val[3] ?? '').trim();
    if (k && v && !(k in out)) out[k] = v;
  }
  return out;
}

const pick = (meta: Record<string, string>, keys: string[]): string | null => {
  for (const k of keys) if (meta[k]) return meta[k];
  return null;
};

// ---- Icon fallback ----
// No og:image? The site's own logo is the next best thing. Apple touch icons
// are the pick of the bunch: Apple requires them to be opaque and they're
// usually 180px square artwork of the brand mark. Then whatever <link rel=icon>
// declares the largest size, then the manifest's icons.
type IconHit = { href: string; size: number };

function parseLinkIcons(h: string, pageUrl: URL): IconHit[] {
  const out: IconHit[] = [];
  const re = /<link\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h))) {
    const attrs = m[1];
    const rel = (attrs.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i) || [])
      .slice(1).find(Boolean)?.toLowerCase() ?? '';
    if (!/\b(apple-touch-icon(-precomposed)?|icon|shortcut icon|fluid-icon|mask-icon)\b/.test(rel)) continue;
    if (/mask-icon/.test(rel)) continue;   // monochrome silhouette, not a logo
    const href = (attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i) || [])
      .slice(1).find(Boolean);
    if (!href) continue;
    const sizes = (attrs.match(/\bsizes\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i) || [])
      .slice(1).find(Boolean) ?? '';
    const declared = Math.max(0, ...(sizes.match(/\d+/g) || ['0']).map(Number));
    // Apple touch icons are opaque and well drawn — rank them above the rest
    // even when they declare no size at all.
    const rank = /apple-touch-icon/.test(rel) ? Math.max(declared, 180) + 1000 : declared;
    try { out.push({ href: new URL(href, pageUrl.href).href, size: rank }); } catch { /* skip */ }
  }
  return out.sort((a, b) => b.size - a.size);
}

// The manifest usually declares the biggest icons a site has, plus the colour
// it wants behind them.
async function fromManifest(h: string, pageUrl: URL): Promise<{ icons: IconHit[]; bg: string | null }> {
  const m = h.match(/<link[^>]+rel=["'](?:manifest|manifest\.json)["'][^>]*href=["']([^"']+)["']/i);
  if (!m) return { icons: [], bg: null };
  try {
    const url = new URL(m[1], pageUrl.href).href;
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { icons: [], bg: null };
    const man = JSON.parse(await res.text());
    const icons: IconHit[] = (man.icons || [])
      .filter((i: { src?: string }) => typeof i.src === 'string')
      .map((i: { src: string; sizes?: string }) => ({
        href: new URL(i.src, url).href,
        size: Math.max(0, ...((i.sizes || '').match(/\d+/g) || ['0']).map(Number)),
      }));
    const bg = typeof man.background_color === 'string' ? man.background_color
      : typeof man.theme_color === 'string' ? man.theme_color : null;
    return { icons: icons.sort((a, b) => b.size - a.size), bg };
  } catch {
    return { icons: [], bg: null };
  }
}

// Sites that strip their <head> for non-browser agents (octobre-editions and
// friends) declare no icon at all. iOS has always fallen back to fixed paths at
// the site root when there's no <link> tag, and most sites still put files
// there — so probe those before giving up.
const WELL_KNOWN = [
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/apple-touch-icon-180x180.png',
];

async function probeWellKnown(pageUrl: URL): Promise<string | null> {
  for (const path of WELL_KNOWN) {
    const href = new URL(path, pageUrl.origin).href;
    try {
      const res = await fetch(href, { method: 'GET', headers: UA, signal: AbortSignal.timeout(4000) });
      if (!res.ok) { await res.body?.cancel(); continue; }
      const type = res.headers.get('content-type') || '';
      await res.body?.cancel();
      // A soft-404 hands back the HTML error page rather than a 404 status.
      if (/^image\//i.test(type)) return href;
    } catch { /* try the next one */ }
  }
  return null;
}

// Last resort: a favicon service. Returns something for practically any domain,
// at a size worth showing — but it's a third party, so it only runs once the
// site itself has offered nothing.
function faviconService(pageUrl: URL): string {
  return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(pageUrl.hostname)}`;
}

// Fetch and decode an image once; both samplers below read the result.
type Sampler = { w: number; h: number; px: (x: number, y: number) => number[] };

// Set by loadImage so a silent miss can be read off the response.
let loadNote = '';

async function loadImage(url: string): Promise<Sampler | null> {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!res.ok) { await res.body?.cancel(); loadNote = `http ${res.status}`; return null; }
    const type = res.headers.get('content-type') || '';
    // ImageScript reads PNG and JPEG; .ico and .svg are skipped.
    if (!/png|jpe?g/i.test(type) && !/\.(png|jpe?g)(\?|$)/i.test(url)) {
      await res.body?.cancel();
      loadNote = `type ${type || 'unknown'}`;
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    // og:images are often full-resolution screenshots — several MB of PNG is
    // normal, and the old 4MB cap was quietly rejecting them.
    if (buf.byteLength > 25_000_000) { loadNote = `too big ${buf.byteLength}`; return null; }
    const { decode } = await import('https://deno.land/x/imagescript@1.2.17/mod.ts');
    const img = await decode(buf);
    if (!('getPixelAt' in img)) { loadNote = 'no getPixelAt'; return null; }
    const w = (img as { width: number }).width;
    const h = (img as { height: number }).height;
    if (!w || !h) { loadNote = 'zero size'; return null; }
    loadNote = `ok ${w}x${h} ${buf.byteLength}b`;
    const px = (x: number, y: number) => {
      const cx = Math.min(Math.max(1, Math.round(x)), w);
      const cy = Math.min(Math.max(1, Math.round(y)), h);
      const v = (img as { getPixelAt: (x: number, y: number) => number }).getPixelAt(cx, cy);
      return [(v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
    };
    return { w, h, px };
  } catch (err) {
    loadNote = `error ${String(err).slice(0, 120)}`;
    return null;
  }
}

// Perceived brightness, 0-255.
const luma = ([r, g, b]: number[]) => 0.299 * r + 0.587 * g + 0.114 * b;

// Sample the colour sitting behind the logo. The four corners of an icon are
// its background if they agree; if they don't (a bleed-to-edge logo), we'd
// rather say nothing and let the tile use its own neutral fill.
function iconBackgroundFrom(img: Sampler): string | null {
  const inset = Math.max(1, Math.round(Math.min(img.w, img.h) * 0.04));
  const corners = [
    img.px(inset, inset),
    img.px(img.w - inset, inset),
    img.px(inset, img.h - inset),
    img.px(img.w - inset, img.h - inset),
  ];
  // A transparent corner means the logo has no background of its own.
  if (corners.some(c => c[3] < 250)) return null;
  const [r0, g0, b0] = corners[0];
  const close = corners.every(([r, g, b]) =>
    Math.abs(r - r0) < 12 && Math.abs(g - g0) < 12 && Math.abs(b - b0) < 12);
  if (!close) return null;
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r0)}${hex(g0)}${hex(b0)}`;
}

async function iconBackground(iconUrl: string): Promise<string | null> {
  const img = await loadImage(iconUrl);
  return img ? iconBackgroundFrom(img) : null;
}

// Is the patch the badge sits on dark?
//
// The tile is a 16:15 window and the photo fills it with object-fit:cover, so
// most of a wide image is cropped away — sampling the source image's own
// top-left corner reads pixels the viewer never sees. Work out what cover
// actually shows first, then sample the badge's corner of THAT.
const TILE_ASPECT = 16 / 15;

let cornerNote = '';

function cornerIsDark(img: Sampler): boolean {
  const aspect = img.w / img.h;
  let x0 = 0, y0 = 0, vw = img.w, vh = img.h;
  if (aspect > TILE_ASPECT) {
    vw = img.h * TILE_ASPECT;          // wider than the tile: sides cropped
    x0 = (img.w - vw) / 2;
  } else {
    vh = img.w / TILE_ASPECT;          // taller: top and bottom cropped
    y0 = (img.h - vh) / 2;
  }
  // The badge is a 32px square 8px in, on a tile roughly 165px wide — call it
  // the first quarter of the visible box in each direction. A grid across it,
  // averaged: one pixel would be at the mercy of a highlight or a dark thread.
  let total = 0;
  let n = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const p = img.px(x0 + vw * (0.03 + 0.23 * (i / 4)), y0 + vh * (0.03 + 0.23 * (j / 4)));
      if (p[3] < 128) continue;   // transparent — the tile fill shows instead
      total += luma(p);
      n++;
    }
  }
  if (!n) { cornerNote = 'all transparent'; return false; }
  const avg = total / n;
  cornerNote = `luma ${Math.round(avg)}`;
  // 150 rather than mid-grey: the icon is near-black, so it needs a genuinely
  // light backdrop to read, and erring toward the light icon is the safer miss.
  return avg < 150;
}

const pageTitle = (h: string): string | null => {
  const m = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
};

// "Faded Black Yuma Hemp Cotton Classic Tee | Buck Mason" -> "Buck Mason"
function titleTail(t: string): string | null {
  const parts = t.split(/\s+[|–—·•:]\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  return last.length <= 40 ? last : null;
}

// "Buck Mason® Official Site" -> "Buck Mason"
function cleanName(t: string): string {
  return t
    .replace(/[®™©]/g, '')
    .replace(/\b(official\s+(site|store|website)|home(page)?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s|–—·•:,-]+|[\s|–—·•:,-]+$/g, '')
    .trim();
}

async function siteNameFrom(meta: Record<string, string>, html: string, pageUrl: URL): Promise<string> {
  const direct = pick(meta, ['og:site_name', 'application-name', 'apple-mobile-web-app-title', 'og:brand']);
  if (direct) return cleanName(direct);

  const t = pageTitle(html);
  if (t) {
    const tail = titleTail(t);
    if (tail) return cleanName(tail);
  }

  // Product pages describe the product, not the site — ask the root instead.
  try {
    const rootRes = await fetch(pageUrl.origin, {
      redirect: 'follow',
      headers: UA,
      signal: AbortSignal.timeout(6000),
    });
    if (rootRes.ok) {
      const rootHtml = (await rootRes.text()).slice(0, 300000);
      const rootMeta = parseMeta(rootHtml);
      const rootDirect = pick(rootMeta, ['og:site_name', 'application-name', 'apple-mobile-web-app-title']);
      if (rootDirect) return cleanName(rootDirect);
      const rootTitle = pageTitle(rootHtml);
      if (rootTitle) {
        const cleaned = cleanName(rootTitle.split(/\s+[|–—·•:]\s+/)[0]);
        if (cleaned) return cleaned;
      }
    }
  } catch { /* fall through to the hostname */ }

  const host = pageUrl.hostname.replace(/^www\./, '').split('.')[0];
  return host.charAt(0).toUpperCase() + host.slice(1);
}

// ---- Amazon ----
// Amazon answers a server's fetch with a robot-check page, so the product page
// itself never gives us an og:image (every tile came back as the Amazon logo).
// But the product id (ASIN) is in the URL — short a.co / amzn.to links carry it
// in their redirect — and Amazon serves a product's main photo from a fixed path
// built from that id, without the robot check.
const AMAZON_HOST = /(^|\.)(amazon\.[a-z.]+|a\.co|amzn\.to|amzn\.com|amzn\.eu)$/i;
const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin|o\/asin|product)\/([A-Z0-9]{10})(?=[/?#]|$)/i;

function asinIn(u: string): string | null {
  const m = u.match(ASIN_RE) || u.match(/[?&](?:asin|ASIN)=([A-Z0-9]{10})\b/);
  return m ? m[1].toUpperCase() : null;
}

// Amazon hands link-unfurling bots (anything that doesn't look like a browser)
// a generic share page instead of redirecting, so this leg goes as Safari.
const BROWSER_UA = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

let amazonNote = '';

// Follow the short link's redirects by hand until a hop names the product. If a
// hop answers with a page instead of a redirect, look for the product id in it.
async function amazonAsin(pageUrl: URL): Promise<string | null> {
  let url = pageUrl.href;
  const hops: string[] = [];
  for (let hop = 0; hop < 6; hop++) {
    const found = asinIn(url);
    if (found) { amazonNote = hops.join(' > '); return found; }
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', headers: BROWSER_UA, signal: AbortSignal.timeout(6000) });
    } catch (err) { amazonNote = `${hops.join(' > ')} | fetch error ${String(err).slice(0, 80)}`; return null; }
    const loc = res.headers.get('location');
    hops.push(`${res.status}${loc ? ' ' + loc.slice(0, 120) : ''}`);
    if (loc && res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      url = new URL(loc, url).href;
      continue;
    }
    // A page, not a redirect: the id is usually in a canonical link, og:url or
    // the page's own data.
    const html = (await res.text()).slice(0, 400000);
    const m = html.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?#"'&\s]|$)/)
      || html.match(/["'](?:asin|ASIN|data-asin|currentAsin|parentAsin)["']?\s*[:=]\s*["']([A-Z0-9]{10})["']/)
      || html.match(/data-asin=["']([A-Z0-9]{10})["']/);
    amazonNote = `${hops.join(' > ')} | page ${m ? 'asin ' + m[1] : 'no asin'}`;
    return m ? m[1].toUpperCase() : null;
  }
  amazonNote = hops.join(' > ');
  return asinIn(url);
}

// The product page, fetched as a browser, names its photos on Amazon's image
// host (images/I/...). Not every request gets the real page — a robot check
// comes back now and then — so this is tried first and the fixed-path photo is
// the fallback.
async function amazonPageImage(asin: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.amazon.com/dp/${asin}`, {
      redirect: 'follow', headers: BROWSER_UA, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { await res.body?.cancel(); amazonNote += ` | page http ${res.status}`; return null; }
    const html = (await res.text()).slice(0, 1500000);
    const m = html.match(/data-old-hires=["'](https:\/\/[^"']+\/images\/I\/[^"']+)["']/)
      || html.match(/"hiRes"\s*:\s*"(https:\/\/[^"]+\/images\/I\/[^"]+)"/)
      || html.match(/"large"\s*:\s*"(https:\/\/[^"]+\/images\/I\/[^"]+)"/)
      || html.match(/id=["']landingImage["'][^>]*?src=["'](https:\/\/[^"']+\/images\/I\/[^"']+)["']/)
      || html.match(/property=["']og:image["'][^>]*content=["'](https:\/\/[^"']+\/images\/I\/[^"']+)["']/)
      || html.match(/(https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+%-]{8,}\._[A-Z0-9_,]*_\.jpg)/);
    amazonNote += ` | page ${m ? 'image' : (/captcha|robot/i.test(html) ? 'robot check' : 'no image')}`;
    return m ? m[1] : null;
  } catch (err) {
    amazonNote += ` | page error ${String(err).slice(0, 60)}`;
    return null;
  }
}

async function amazonPreview(pageUrl: URL): Promise<Response | null> {
  amazonNote = '';
  if (!AMAZON_HOST.test(pageUrl.hostname)) return null;
  const asin = await amazonAsin(pageUrl);
  if (!asin) return null;
  const fromPage = await amazonPageImage(asin);
  const candidates = [
    ...(fromPage ? [fromPage] : []),
    `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`,
    `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL500_.jpg`,
  ];
  for (const image of candidates) {
    const img = await loadImage(image);
    // A missing product comes back as a tiny placeholder (often a 1x1 GIF,
    // which can't be sampled).
    if (!img || img.w < 20 || img.h < 20) { amazonNote += ` | miss ${image.split('/').pop()} ${loadNote}`; continue; }
    return json({
      image, isIcon: false, imageBg: null, cornerDark: cornerIsDark(img),
      title: null, siteName: 'Amazon', debugCorner: `amazon ${asin} | ${loadNote} | ${cornerNote}`, debugAmazon: amazonNote,
    });
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const target = new URL(req.url).searchParams.get('url');
  if (!target) return json({ error: 'missing url' }, 400);

  let pageUrl: URL;
  try {
    pageUrl = new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`);
  } catch {
    return json({ error: 'bad url' }, 400);
  }
  if (pageUrl.protocol !== 'http:' && pageUrl.protocol !== 'https:') {
    return json({ error: 'unsupported protocol' }, 400);
  }

  try {
    const amazon = await amazonPreview(pageUrl);
    if (amazon) return amazon;

    const res = await fetch(pageUrl.href, {
      redirect: 'follow',
      headers: UA,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // The page refused us, but its root icons usually don't.
      const fallback = await probeWellKnown(pageUrl) || faviconService(pageUrl);
      const bg = await iconBackground(fallback);
      return json({
        image: fallback, isIcon: true, imageBg: bg,
        cornerDark: bg ? luma([1, 3, 5].map((_, i) => parseInt(bg.replace('#', '').slice(i * 2, i * 2 + 2), 16) || 0)) < 150 : false,
        title: null, siteName: null,
      });
    }

    // Only the <head> is needed — cap the read so a huge page can't stall this.
    const html = (await res.text()).slice(0, 300000);
    const meta = parseMeta(html);

    const linkTag = html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);
    const raw =
      pick(meta, ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src']) ||
      (linkTag && linkTag[1]) ||
      null;

    const title = pick(meta, ['og:title', 'twitter:title']) || pageTitle(html);
    // Resolve protocol-relative and root-relative URLs against the page
    let image = raw ? new URL(raw, pageUrl.href).href : null;
    const siteName = await siteNameFrom(meta, html, pageUrl);

    // No page image — fall back to the site's own logo, and work out what
    // colour belongs behind it.
    let isIcon = false;
    let imageBg: string | null = null;
    let cornerDark = false;
    if (!image) {
      const manifest = await fromManifest(html, pageUrl);
      const candidates = [...parseLinkIcons(html, pageUrl), ...manifest.icons];
      const msTile = pick(meta, ['msapplication-tileimage']);
      if (msTile) {
        try { candidates.push({ href: new URL(msTile, pageUrl.href).href, size: 150 }); } catch { /* skip */ }
      }
      // Anything but a bare .ico — those are 16-32px and look mushy blown up.
      const declared = candidates.find(c => !/\.ico(\?|$)/i.test(c.href));
      const best = declared?.href
        || await probeWellKnown(pageUrl)
        || faviconService(pageUrl);
      if (best) {
        image = best;
        isIcon = true;
        const iconImg = await loadImage(best);
        imageBg = (iconImg && iconBackgroundFrom(iconImg))
          || manifest.bg
          || pick(meta, ['theme-color', 'msapplication-tilecolor'])
          || null;
        if (imageBg && !/^#[0-9a-f]{3,8}$/i.test(imageBg.trim())) imageBg = null;
        // A logo is centred on its own fill, so the badge sits on that fill.
        if (imageBg) {
          const hx = imageBg.replace('#', '');
          const full = hx.length === 3 ? hx.split('').map(c => c + c).join('') : hx.slice(0, 6);
          const rgb = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) || 0);
          cornerDark = luma(rgb) < 150;
        }
      }
    } else {
      // Page photo: look at the patch the badge will cover.
      const pageImg = await loadImage(image);
      if (pageImg) cornerDark = cornerIsDark(pageImg);
    }

    // Temporary: lets us see what the parser actually found if this still misses.
    const debugMetaKeys = Object.keys(meta).slice(0, 60);

    return json({ image, isIcon, imageBg, cornerDark, title, siteName, debugMetaKeys, debugCorner: `${loadNote} | ${cornerNote}`, debugAmazon: amazonNote });
  } catch (err) {
    return json({ image: null, isIcon: false, imageBg: null, cornerDark: false, title: null, siteName: null, error: String(err) });
  }
});

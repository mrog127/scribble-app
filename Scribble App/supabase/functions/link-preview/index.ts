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
    const res = await fetch(pageUrl.href, {
      redirect: 'follow',
      headers: UA,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return json({ image: null, title: null, siteName: null });

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
    const image = raw ? new URL(raw, pageUrl.href).href : null;
    const siteName = await siteNameFrom(meta, html, pageUrl);

    // Temporary: lets us see what the parser actually found if this still misses.
    const debugMetaKeys = Object.keys(meta).slice(0, 60);

    return json({ image, title, siteName, debugMetaKeys });
  } catch (err) {
    return json({ image: null, title: null, siteName: null, error: String(err) });
  }
});

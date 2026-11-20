#!/usr/bin/env python3
"""
build_standalone.py — optimize + verify a roadtrip render-engine working dir so it
is fast to load AND portable, with a hard quality gate.

The roadtrip deliverable is authored as a small render engine:

    <work_dir>/
      index.html      # inline CSS + JS; the components & design system.
                      # Loads content via  <script src="data.js"></script>
      data.js         # TRIP meta + ROUTES array (all trip content)
      assets/*.jpeg   # every image: hero, per-day scenery, per-dish food, etc.

WHY THIS SCRIPT EXISTS — AND WHY THE DEFAULT IS A DIRECTORY, NOT ONE FILE
  An earlier version base64-inlined every image into one ~20MB HTML. That made the
  file "portable" but slow: the browser must download and parse the entire 20MB blob
  before first paint, and base64 inflates bytes ~33% and defeats per-image lazy
  loading and caching. Real measurements showed >10s to render.

  The fast, still-portable approach is to ship the DIRECTORY (index.html + data.js +
  assets/) and deploy it whole so assets/ travels with the page. The browser then
  loads a tiny HTML shell (~35KB) plus data.js, paints immediately, preloads only the
  hero (the LCP image), and lazy-loads the rest on scroll. Local relative asset paths
  (assets/<name>.webp) never expire and are globally reachable as long as the folder
  ships with the page — which it does for a static-site/dir deploy.

WHAT IT DOES (default mode)
  1. OPTIMIZE  — convert every assets/*.jpeg|*.jpg to WebP and downscale: day/hero/
                 scenery cap at 1080px @ q78, food thumbnails at 480px @ q72. WebP is
                 ~25-34% smaller than JPEG at equal quality and cuts total image bytes
                 roughly in half here, with no visible loss. Rewrites the asset refs in
                 data.js and index.html from .jpeg/.jpg to .webp. Idempotent: assets
                 already in WebP are left alone. (Skipped gracefully if Pillow is
                 missing — then refs are not rewritten either.)
  2. VERIFY    — confirm every referenced asset exists on disk (exit 5 if not) and that
                 NO forbidden/expiring/region-locked URL appears anywhere (exit 4).
                 Local assets/<name> refs are EXPECTED here, not flagged — they are the
                 whole point of the directory deliverable.
  3. SANITY    — warn (non-fatal) if the hero is not preloaded, if day images are not
                 lazy-loaded, or if a day-header image is duplicated across days.

  The deploy artifact in default mode is the WORKING DIRECTORY itself. Deploy the whole
  directory (e.g. surge deploys the folder) so assets/ travels with index.html.

--inline MODE (opt-in, single-file fallback)
  Some hand-offs need literally one HTML file. With --inline the script additionally
  base64-inlines data.js and every asset into <out> (default atlas_standalone.html) and
  applies the same hard gate (zero un-inlined asset refs, zero forbidden URLs). This is
  the slow-first-paint path; use only when a single file is truly required.

WHY THE REGEX MATTERS
  Asset filenames contain digits (canada_d1.webp, norway_food5.webp). An earlier build
  used [a-z_]+ and silently skipped every numbered file. The asset pattern here is
  [a-z0-9_]+ on purpose.

USAGE
  python3 build_standalone.py <work_dir>             # optimize + verify the directory
  python3 build_standalone.py <work_dir> --inline    # also emit single-file fallback
  python3 build_standalone.py <work_dir> --inline --out X.html
  python3 build_standalone.py <work_dir> --no-optimize  # skip WebP conversion

EXIT CODES
  0  directory is optimized and verified deploy-ready (and single file written if --inline)
  2  bad usage / missing index.html or data.js
  4  GATE failed — forbidden/expiring URLs found (or, with --inline, un-inlined refs)
  5  a referenced asset file does not exist on disk
"""
import argparse
import base64
import glob
import os
import re
import sys

ASSET_RE = re.compile(r'assets/[a-z0-9_]+\.(?:jpe?g|png|webp|gif|svg)', re.I)
FORBIDDEN_RE = re.compile(
    r'x-orig-expires|x-orig-sign|-img-sign-|lk3s=|[?&]Expires=|[?&]Signature=|'
    r'X-Amz-|byteintl\.net|bytedance\.net|fonts\.googleapis\.com|fonts\.gstatic\.com',
    re.I,
)
# day-header images are named <route>_d<n>.<ext>; used for the dup check.
DAY_IMG_RE = re.compile(r'assets/([a-z0-9]+)_d(\d+)\.(?:jpe?g|png|webp)', re.I)

MIME = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml'}


def log(m):
    print(m, file=sys.stderr)


def optimize_to_webp(assets_dir, files_to_rewrite):
    """Convert assets/*.jpeg|*.jpg to downscaled WebP, delete the source jpegs, and
    rewrite asset references in the given files from .jpeg/.jpg to .webp.

    Returns the count of converted images. Idempotent — if there are no jpegs (already
    WebP, or none), it is a no-op. Gracefully skips (no conversion, no rewrite) if
    Pillow is unavailable, so the build still proceeds with whatever assets exist.
    """
    try:
        from PIL import Image
    except ImportError:
        log('[optimize] Pillow not installed — skipping WebP conversion. '
            '(pip install --user --break-system-packages Pillow to enable.)')
        return 0
    jpegs = sorted(glob.glob(os.path.join(assets_dir, '*.jpeg')) +
                   glob.glob(os.path.join(assets_dir, '*.jpg')))
    if not jpegs:
        return 0
    before = sum(os.path.getsize(f) for f in jpegs)
    mapping = {}  # old relative ref fragment -> new (basename level)
    for f in jpegs:
        base = os.path.basename(f)
        is_food = 'food' in base.lower()
        maxw, q = (480, 72) if is_food else (1080, 78)
        try:
            im = Image.open(f).convert('RGB')
            w, h = im.size
            if w > maxw:
                im = im.resize((maxw, round(h * maxw / w)), Image.LANCZOS)
            stem = os.path.splitext(base)[0]
            im.save(os.path.join(assets_dir, stem + '.webp'), 'WEBP',
                    quality=q, method=6)
            mapping[base] = stem + '.webp'
            os.remove(f)
        except Exception as e:  # noqa: BLE001
            log(f'[optimize] skip {base}: {e}')
    after = sum(os.path.getsize(os.path.join(assets_dir, v))
                for v in mapping.values())
    pct = (100 * after // before) if before else 100
    log(f'[optimize] {len(mapping)} img(s) -> WebP  {before // 1024}KB -> '
        f'{after // 1024}KB ({pct}%)')

    # rewrite refs in data.js / index.html: assets/<stem>.jpeg|jpg -> assets/<stem>.webp
    for path in files_to_rewrite:
        if not os.path.isfile(path):
            continue
        s = open(path, encoding='utf-8').read()
        n = 0
        for old, new in mapping.items():
            tok_old, tok_new = 'assets/' + old, 'assets/' + new
            cnt = s.count(tok_old)
            if cnt:
                s = s.replace(tok_old, tok_new)
                n += cnt
        open(path, 'w', encoding='utf-8').write(s)
        if n:
            log(f'[optimize] {os.path.basename(path)}: {n} ref(s) -> .webp')
    return len(mapping)


def check_day_image_dups(all_refs):
    """Warn (non-fatal) if the same day-header image file is used for more than one
    day. Takes the RAW (non-deduped) list of asset refs so repeats are visible — a
    deduplicated set would hide exactly the duplication we want to catch."""
    counts = {}
    for r in all_refs:
        if DAY_IMG_RE.match(r):
            counts[r] = counts.get(r, 0) + 1
    dups = [r for r, c in counts.items() if c > 1]
    if dups:
        log('[warn] duplicate day-header image(s) detected (each day should be '
            'unique): ' + ', '.join(sorted(set(dups))))


def check_perf_markup(html):
    """Warn (non-fatal) if the page is missing the load-speed affordances that keep
    LCP low: a preloaded hero (the LCP image) and lazy-loaded below-the-fold images."""
    if 'rel="preload"' not in html and "rel='preload'" not in html:
        log('[warn] no <link rel="preload" as="image"> for the hero — the LCP image '
            'will load late. Preload the hero with fetchpriority="high".')
    if 'loading="lazy"' not in html and "loading='lazy'" not in html:
        log('[warn] no loading="lazy" found — below-the-fold images will all load up '
            'front and slow first paint. Lazy-load day/food/modal images.')


def to_data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    mime = MIME.get(ext, 'application/octet-stream')
    with open(path, 'rb') as f:
        b = f.read()
    return f'data:{mime};base64,' + base64.b64encode(b).decode('ascii')


def main():
    ap = argparse.ArgumentParser(
        description='Optimize + verify a roadtrip render-engine working dir for deploy.')
    ap.add_argument('work_dir', help='Directory containing index.html, data.js, assets/')
    ap.add_argument('--inline', action='store_true',
                    help='Also emit a single self-contained HTML (base64). Slow first '
                         'paint; use only when one file is required.')
    ap.add_argument('--out', default=None,
                    help='Output path for --inline (default <work_dir>/atlas_standalone.html)')
    ap.add_argument('--no-optimize', action='store_true',
                    help='Skip WebP conversion/downscale')
    args = ap.parse_args()

    d = os.path.abspath(args.work_dir)
    index_p = os.path.join(d, 'index.html')
    data_p = os.path.join(d, 'data.js')
    assets_dir = os.path.join(d, 'assets')
    out_p = args.out or os.path.join(d, 'atlas_standalone.html')

    if not os.path.isfile(index_p):
        log(f'[error] no index.html in {d}'); sys.exit(2)
    if not os.path.isfile(data_p):
        log(f'[error] no data.js in {d}'); sys.exit(2)

    if not args.no_optimize:
        optimize_to_webp(assets_dir, [data_p, index_p])

    html = open(index_p, encoding='utf-8').read()
    datajs = open(data_p, encoding='utf-8').read()

    # collect every asset ref across both files, verify each exists on disk
    all_refs = ASSET_RE.findall(html + datajs)   # raw (with repeats) for the dup check
    refs = sorted(set(all_refs))
    missing = [r for r in refs if not os.path.isfile(os.path.join(d, r))]
    if missing:
        log('[error] referenced asset file(s) not found on disk:')
        for m in missing:
            log(f'   ✗ {m}')
        sys.exit(5)
    check_day_image_dups(all_refs)
    check_perf_markup(html)

    # forbidden/expiring URL check applies in BOTH modes (a remote/expiring URL is a
    # broken deliverable whether or not we inline). Local assets/ refs are fine.
    forbidden = sorted(set(FORBIDDEN_RE.findall(html + datajs)))
    if forbidden:
        log('=' * 60)
        log('GATE FAILED — forbidden/expiring/region-locked URL(s) present:')
        log('  ' + ', '.join(forbidden))
        log('Replace them with LOCAL assets/<name>.webp (download the image into '
            'assets/ first). A signed/expiring/remote URL 403s once it expires or '
            'when opened from another region.')
        log('=' * 60)
        sys.exit(4)

    if not args.inline:
        # DEFAULT: the directory itself is the deploy artifact.
        total = 0
        for r in refs:
            total += os.path.getsize(os.path.join(d, r))
        log(f'[ok] directory verified deploy-ready: {len(refs)} local asset(s), '
            f'{total // 1024}KB total, 0 forbidden URLs.')
        log(f'[ok] deploy the WHOLE directory ({d}) so assets/ travels with the page. '
            'index.html + data.js are a tiny shell; images lazy-load on scroll.')
        sys.exit(0)

    # ---- --inline: build the single self-contained file --------------------
    uri = {r: to_data_uri(os.path.join(d, r)) for r in refs}
    for r, u in uri.items():
        datajs = datajs.replace(r, u)

    datajs_inlined = False
    for tag in ('<script src="data.js"></script>',
                "<script src='data.js'></script>"):
        if tag in html:
            html = html.replace(tag, '<script>\n' + datajs + '\n</script>')
            datajs_inlined = True
            break
    if not datajs_inlined:
        m = re.search(r'<script[^>]*\bsrc=["\']data\.js["\'][^>]*>\s*</script>', html)
        if m:
            html = html[:m.start()] + '<script>\n' + datajs + '\n</script>' + html[m.end():]
            datajs_inlined = True
    if not datajs_inlined:
        log('[error] could not find <script src="data.js"></script> to inline.')
        sys.exit(2)

    for r, u in uri.items():
        html = html.replace(r, u)

    leftover_assets = sorted(set(ASSET_RE.findall(html)))
    if leftover_assets:
        log('=' * 60)
        log('INLINE GATE FAILED — un-inlined asset ref(s) remain:')
        for a in leftover_assets[:20]:
            log(f'      ✗ {a}')
        log('=' * 60)
        sys.exit(4)

    with open(out_p, 'w', encoding='utf-8') as f:
        f.write(html)
    size_mb = os.path.getsize(out_p) / 1024 / 1024
    log(f'[ok] wrote single-file {out_p}  ({size_mb:.2f} MB); inlined {len(refs)} '
        'image(s); gate clean.')
    log('[note] single-file mode has slower first paint than the directory deploy.')
    sys.exit(0)


if __name__ == '__main__':
    main()

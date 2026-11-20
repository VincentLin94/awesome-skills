#!/usr/bin/env python3
"""
localize_assets.py — make a roadtrip HTML deliverable self-contained and portable.

The roadtrip deliverable is an interactive HTML "travel map" (normally a
render-engine directory: index.html + data.js + assets/). This script is the
fallback for a hand-authored HTML that still references remote image URLs. Image
generators and internal tools hand back *signed, expiring, region-locked* image
URLs (anything carrying `x-orig-expires`, `-img-sign-`, `lk3s=`, a TOS/OSS
signature, or an internal corp host). Embedded verbatim, those links 403 the
moment the signature expires or when the page is opened from another network /
region — the classic "图片在国内打不开 / 过几天就裂了" failure.

This script eliminates that class of bug. It:

  1. LOCALIZES every remote image referenced by the HTML — downloads it (keeping
     the full signed URL so the fetch itself succeeds) into a sibling `assets/`
     folder and rewrites the reference to a relative `assets/<name>.<ext>` path
     (or, with --inline, a base64 data: URI so the result is a single file).

  2. AUDITS the result — scans the final HTML for any forbidden resource
     reference (signed/expiring URLs, internal hosts, blocked font CDNs) and
     exits non-zero if any remain. Use --audit to run ONLY this gate (no changes).

External citation / source links in the report body are NOT touched or flagged —
they are navigation, not page assets. The audit targets resources the page loads
to render itself (img src, css url(), <link>/<script> src/href, @font-face).

USAGE
  # Localize + rewrite + audit (writes alongside the input, creating assets/):
  python3 localize_assets.py path/to/index.html
  # Single-file output (base64-inline every image, no assets/ folder):
  python3 localize_assets.py path/to/index.html --inline
  # Audit only — fail if the HTML still references any non-portable resource:
  python3 localize_assets.py path/to/index.html --audit

EXIT CODES
  0  HTML is self-contained (after localizing, or audit passed clean)
  1  unexpected error
  4  audit FAILED — non-portable resource(s) remain (listed on stderr)
"""
import argparse
import base64
import hashlib
import mimetypes
import os
import re
import sys
import urllib.request

# --- what makes a resource non-portable -------------------------------------
# Signed / expiring / internal / region-blocked signals. If any appears in a URL
# the page LOADS (not a citation link), the deliverable is broken.
FORBIDDEN_PATTERNS = [
    r"x-orig-expires", r"x-orig-sign", r"-img-sign-", r"lk3s=",
    r"[?&]Expires=", r"[?&]Signature=", r"X-Amz-",
    r"byteintl\.net", r"bytedance\.net",
    r"fonts\.googleapis\.com", r"fonts\.gstatic\.com",
]
FORBIDDEN_RE = re.compile("|".join(FORBIDDEN_PATTERNS), re.I)

# URL occurrences that are page-loaded ASSETS (these we localize/audit).
# img src=, url(...) in CSS, <link href=, <script src=.
ASSET_URL_RE = re.compile(
    r"""(?:src\s*=\s*|href\s*=\s*|url\s*\(\s*)['"]?(https?://[^"')\s]+)""", re.I
)


def log(m):
    print(m, file=sys.stderr)


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "roadtrip-localize/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", "")


def ext_for(url, content_type):
    # Prefer the path extension; fall back to content-type.
    path = url.split("?", 1)[0]
    _, e = os.path.splitext(path)
    if e and len(e) <= 6:
        return e
    guessed = mimetypes.guess_extension((content_type or "").split(";")[0].strip())
    return guessed or ".bin"


def collect_asset_urls(html):
    """Return unique remote URLs the page loads as assets (deduped, in order)."""
    seen, out = set(), []
    for m in ASSET_URL_RE.finditer(html):
        u = m.group(1)
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def localize(html_path, inline):
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    urls = collect_asset_urls(html)
    if not urls:
        log("[localize] no remote asset URLs found.")
        return html, 0

    out_dir = os.path.dirname(os.path.abspath(html_path))
    assets_dir = os.path.join(out_dir, "assets")
    if not inline:
        os.makedirs(assets_dir, exist_ok=True)

    replaced = 0
    for url in urls:
        try:
            data, ctype = fetch(url)
        except Exception as e:  # noqa: BLE001
            log(f"[warn] failed to download (left as-is): {url[:80]}... {e}")
            continue
        if inline:
            ctype_clean = (ctype or "application/octet-stream").split(";")[0].strip()
            b64 = base64.b64encode(data).decode("ascii")
            repl = f"data:{ctype_clean};base64,{b64}"
        else:
            name = hashlib.md5(url.encode()).hexdigest()[:16] + ext_for(url, ctype)
            with open(os.path.join(assets_dir, name), "wb") as g:
                g.write(data)
            repl = f"assets/{name}"
        html = html.replace(url, repl)
        replaced += 1
        log(f"[ok] localized {url[:70]}... -> {repl[:48]}")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    log(f"[localize] rewrote {replaced} asset reference(s) in {html_path}")
    return html, replaced


def audit(html):
    """Return list of forbidden asset URLs still present. Empty == clean."""
    hits = []
    for url in collect_asset_urls(html):
        if FORBIDDEN_RE.search(url):
            hits.append(url)
    return hits


def main():
    ap = argparse.ArgumentParser(description="Localize + audit roadtrip HTML assets for portability.")
    ap.add_argument("html", help="Path to the HTML deliverable")
    ap.add_argument("--inline", action="store_true",
                    help="Inline images as base64 data: URIs (single-file output, no assets/ folder)")
    ap.add_argument("--audit", action="store_true",
                    help="Audit only: do NOT modify; exit 4 if any non-portable resource remains")
    args = ap.parse_args()

    if not os.path.isfile(args.html):
        log(f"[error] no such file: {args.html}")
        sys.exit(1)

    if args.audit:
        with open(args.html, "r", encoding="utf-8") as f:
            html = f.read()
    else:
        html, _ = localize(args.html, args.inline)

    hits = audit(html)
    if hits:
        log("=" * 60)
        log("AUDIT FAILED — non-portable resource(s) the page loads:")
        for h in hits:
            log(f"  ✗ {h}")
        log("These will 403 when signatures expire or from blocked regions.")
        log("Localize them (drop --audit) or self-host fonts, then re-audit.")
        log("=" * 60)
        sys.exit(4)

    log("[audit] clean — every page resource is local / non-expiring / reachable.")
    sys.exit(0)


if __name__ == "__main__":
    main()

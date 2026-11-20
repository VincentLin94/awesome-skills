#!/usr/bin/env python3
"""
sensight_fetch.py — authentic-source travel research helper for the `roadtrip` skill.

Wraps the Sensight skill (小红书/微博/微信公众号/Twitter social search) with the two
things every roadtrip research call needs but is easy to get wrong:

  1. AUTH that degrades gracefully across environments. Different agent harnesses
     authenticate Sensight differently (Feishu union_id, email, or device-code).
     This script attempts whatever credential you give it, and if the service
     still demands interactive auth it surfaces the auth URL for the calling
     agent to relay — it never hardcodes a company domain or env var.

  2. PLATFORM DEGRADATION. A multi-platform query sometimes returns empty. The
     proven recovery is: all platforms -> single richest platform (小红书) with a
     simplified query -> drop the time window. This script does that automatically
     so each route reliably yields content.

It shells out to the installed Sensight skill rather than reimplementing its API,
so it stays correct as Sensight evolves. Sensight is an OPTIONAL dependency: if it
isn't installed, this script exits with code 3 and a clear message so the agent
can fall back to Reddit/forums/web per source-retrieval.md.

USAGE
  python3 sensight_fetch.py --query "班夫国家公园 自驾 攻略 落基山" \
      [--platforms 2 3 4 1] [--size 20] [--out s_banff.json] \
      [--email you@example.com] [--union-id <feishu_union_id>] \
      [--sensight-dir /path/to/sensight]

PLATFORM IDS: 1=Twitter/X  2=小红书  3=微博  4=微信公众号

EXIT CODES
  0  got non-empty results (or empty after honest degradation)
  2  interactive auth required — auth_url printed to stderr for the agent to relay
  3  Sensight skill not found — fall back to non-social sources
  1  unexpected error
"""
import argparse
import glob
import json
import os
import subprocess
import sys


def log(msg):
    print(msg, file=sys.stderr)


def find_sensight_dir(explicit):
    """Locate the installed Sensight skill without hardcoding one environment."""
    candidates = []
    if explicit:
        candidates.append(explicit)
    if os.environ.get("SENSIGHT_DIR"):
        candidates.append(os.environ["SENSIGHT_DIR"])
    # Common install roots across harnesses; globbed, not assumed.
    home = os.path.expanduser("~")
    patterns = [
        os.path.join(home, ".claude", "skills", "*", "sensight"),
        os.path.join(home, ".claude", "skills", "sensight"),
        "/data/plugins/*/skills/sensight",
        "/data/plugins/*/sensight",
        os.path.join(home, "*", "skills", "sensight"),
    ]
    for pat in patterns:
        candidates.extend(sorted(glob.glob(pat)))
    for c in candidates:
        if c and os.path.isfile(os.path.join(c, "scripts", "sensight.py")):
            return c
    return None


def run_sensight(sensight_dir, args_list, timeout=60):
    """Invoke sensight.py and return (rc, stdout, stderr)."""
    cmd = [sys.executable, os.path.join("scripts", "sensight.py")] + args_list
    try:
        p = subprocess.run(
            cmd, cwd=sensight_dir, capture_output=True, text=True, timeout=timeout
        )
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout after {timeout}s"


def needs_auth(stdout, stderr):
    """Detect Sensight's interactive-auth sentinel anywhere in the output."""
    blob = (stdout or "") + "\n" + (stderr or "")
    return "AGENT_ACTION_REQUIRED" in blob, blob


def extract_auth_url(blob):
    for token in blob.replace("\n", " ").split():
        if token.startswith("auth_url="):
            return token.split("=", 1)[1]
    return None


def try_auth(sensight_dir, email, union_id):
    """Best-effort, environment-agnostic auth. Returns True if a call was made."""
    if union_id:
        log("[auth] attempting Feishu union_id auth")
        rc, out, err = _auth_call(sensight_dir, ["feishu_user", "--union_id", union_id])
        log(f"[auth] feishu rc={rc} {out.strip() or err.strip()}")
        return True
    if email:
        log(f"[auth] attempting email auth ({email})")
        rc, out, err = _auth_call(sensight_dir, ["email_user", "--email", email])
        log(f"[auth] email rc={rc} {out.strip() or err.strip()}")
        return True
    # No credential supplied: try env candidates, but DO NOT invent a domain.
    for var in ("SENSIGHT_EMAIL", "USER_EMAIL", "EMAIL"):
        val = os.environ.get(var)
        if val and "@" in val:
            log(f"[auth] attempting email auth from ${var}")
            rc, out, err = _auth_call(sensight_dir, ["email_user", "--email", val])
            log(f"[auth] email rc={rc} {out.strip() or err.strip()}")
            return True
    log("[auth] no credential available to auto-authenticate")
    return False


def _auth_call(sensight_dir, sub):
    cmd = [sys.executable, os.path.join("scripts", "auth.py")] + sub
    try:
        p = subprocess.run(
            cmd, cwd=sensight_dir, capture_output=True, text=True, timeout=20
        )
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, "", "auth timeout"


def parse_items(stdout):
    """Return list of items from a social_search JSON payload, tolerant of shape."""
    try:
        data = json.loads(stdout)
    except (json.JSONDecodeError, TypeError):
        return None, None
    if not isinstance(data, dict):
        return None, data
    for key in ("items", "posts", "data", "results"):
        v = data.get(key)
        if isinstance(v, list):
            return v, data
        if isinstance(v, dict):
            for k2 in ("items", "posts", "list"):
                if isinstance(v.get(k2), list):
                    return v[k2], data
    return [], data


def social_search(sensight_dir, query, platforms, size):
    args = ["social_search", "--query", query, "--size", str(size)]
    if platforms:
        args += ["--platforms"] + [str(p) for p in platforms]
    rc, out, err = run_sensight(sensight_dir, args)
    return rc, out, err


def main():
    ap = argparse.ArgumentParser(description="Authentic-source travel research via Sensight, with auth + platform degradation.")
    ap.add_argument("--query", required=True, help="Search query, e.g. '班夫 自驾 攻略 落基山'")
    ap.add_argument("--platforms", nargs="*", type=int, default=[2, 3, 4, 1],
                    help="Platform IDs to try first (1=Twitter 2=小红书 3=微博 4=微信). Default: 2 3 4 1")
    ap.add_argument("--size", type=int, default=20)
    ap.add_argument("--out", help="Save raw JSON of the best attempt to this path")
    ap.add_argument("--email", help="Email credential for Sensight auth (optional)")
    ap.add_argument("--union-id", help="Feishu union_id credential for Sensight auth (optional)")
    ap.add_argument("--sensight-dir", help="Path to the installed sensight skill (auto-detected if omitted)")
    ap.add_argument("--min-items", type=int, default=1, help="Treat fewer than this as empty and degrade")
    args = ap.parse_args()

    sensight_dir = find_sensight_dir(args.sensight_dir)
    if not sensight_dir:
        log("Sensight skill not found. Set --sensight-dir or $SENSIGHT_DIR, or fall back to Reddit/forums/web per source-retrieval.md.")
        sys.exit(3)
    log(f"[sensight] using {sensight_dir}")

    authed = False

    # Degradation ladder: each rung is (platforms, query, note).
    primary = args.query
    # A simplified query keeps destination + intent, drops long keyword chains.
    simple = " ".join(args.query.split()[:4]) if len(args.query.split()) > 4 else args.query
    ladder = [
        (args.platforms, primary, "all requested platforms"),
        ([2], simple, "single platform 小红书 + simplified query"),
        ([2], simple, "小红书, time window dropped (default recent)"),
    ]

    best = None
    for platforms, q, note in ladder:
        log(f"[try] {note}: platforms={platforms} query={q!r}")
        rc, out, err = social_search(sensight_dir, q, platforms, args.size)
        auth_required, blob = needs_auth(out, err)

        if auth_required and not authed:
            log("[auth] Sensight requires authentication; attempting credentialed auth")
            authed = try_auth(sensight_dir, args.email, args.union_id)
            if authed:
                rc, out, err = social_search(sensight_dir, q, platforms, args.size)
                auth_required, blob = needs_auth(out, err)

        if auth_required:
            url = extract_auth_url(blob)
            log("=" * 60)
            log("INTERACTIVE AUTH REQUIRED for Sensight.")
            if url:
                log(f"Relay this to the user to authorize, then re-run:\n  {url}")
            else:
                log("Authenticate Sensight per your environment (Feishu card / email / device code), then re-run.")
            log("=" * 60)
            sys.exit(2)

        items, data = parse_items(out)
        if items is None:
            log(f"[warn] non-JSON or unparneable response (rc={rc}); {err.strip()[:200]}")
            continue
        log(f"[result] {len(items)} item(s)")
        if best is None or len(items) > len(best[0] or []):
            best = (items, out)
        if len(items) >= args.min_items:
            break  # good enough, stop degrading

    if best is None:
        log("No usable response from any attempt. Fall back to Reddit/forums/web per source-retrieval.md.")
        sys.exit(0)

    items, raw = best
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(raw)
        log(f"[saved] {len(items)} item(s) -> {args.out}")

    # Compact preview to stdout so the agent sees signal without re-reading a huge blob.
    print(json.dumps({"item_count": len(items),
                      "preview": [
                          (it.get("content") or it.get("text") or "")[:160]
                          for it in items[:5] if isinstance(it, dict)
                      ]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

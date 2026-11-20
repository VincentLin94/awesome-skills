#!/usr/bin/env python3
"""
HTML2Surge deploy helper.

Publishes a single HTML file (or a directory) to surge.sh and returns a
public URL. Handles three concerns that make naive `surge` calls fail:

  1. surge reads the password prompt straight from /dev/tty, so piping
     credentials does not work -> first-time registration is driven through
     a pseudo-terminal (pty).
  2. After the first login, credentials live in ~/.netrc ($HOME is
     persistent), so later deploys are fully non-interactive.
  3. surge serves the root domain from index.html, so a lone *.html file is
     copied to <staging>/index.html before publishing.

Usage:
  python3 deploy.py --src /path/to/page.html [--domain my-name.surge.sh]
  python3 deploy.py --src /path/to/dir       [--domain my-name.surge.sh]

Options:
  --src      Required. Path to an .html file or a directory containing one.
  --domain   Optional. Target *.surge.sh subdomain. Auto-generated if omitted.
  --register Optional. "email:password" to create/login an account when no
             stored credential exists. If omitted and no credential is found,
             a throwaway account is generated automatically.

Prints a JSON blob on the last line: {"ok":bool,"url":...,"domain":...,"http":int}
"""
import argparse
import json
import os
import re
import select
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

HOME = os.path.expanduser("~")
NPM_BIN = os.path.join(HOME, ".npm-global", "bin")
SURGE_LINK = os.path.join(NPM_BIN, "surge")
SURGE_JS = os.path.join(HOME, ".npm-global", "lib", "node_modules", "surge", "bin", "surge")
ENV = dict(os.environ, PATH=NPM_BIN + os.pathsep + os.environ.get("PATH", ""))


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def ensure_surge():
    """Install surge into the user npm prefix if it is not present."""
    if os.path.exists(SURGE_JS):
        return
    log("[setup] surge not found, installing to ~/.npm-global ...")
    subprocess.run(["npm", "config", "set", "prefix", os.path.join(HOME, ".npm-global")],
                   env=ENV, check=False)
    r = subprocess.run(["npm", "install", "-g", "surge"], env=ENV,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    log(r.stdout[-500:] if r.stdout else "")
    if not os.path.exists(SURGE_JS):
        raise RuntimeError("surge install failed")


def has_credentials():
    netrc = os.path.join(HOME, ".netrc")
    if not os.path.exists(netrc):
        return False
    txt = open(netrc, encoding="utf-8", errors="replace").read()
    return "surge.surge.sh" in txt


def whoami():
    try:
        r = subprocess.run([SURGE_LINK, "whoami"], env=ENV,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           text=True, timeout=30)
        m = re.search(r"[\w.+-]+@[\w.-]+", r.stdout)
        return m.group(0) if m else None
    except Exception:
        return None


def pty_run(args, answers, timeout=120):
    """Run `node surge <args>` under a pty, answering prompts.

    answers: list of (needle_lower_bytes, response_str) consumed in order.
    Returns full captured output (str).
    """
    import pty
    master, slave = pty.openpty()
    pid = os.fork()
    if pid == 0:
        os.setsid()
        os.dup2(slave, 0); os.dup2(slave, 1); os.dup2(slave, 2)
        os.execvpe("node", ["node", SURGE_JS] + args, ENV)
        os._exit(127)
    os.close(slave)
    buf = b""
    out = b""
    idx = 0
    start = time.time()
    while time.time() - start < timeout:
        try:
            r, _, _ = select.select([master], [], [], 1)
        except OSError:
            break
        if master in r:
            try:
                data = os.read(master, 4096)
            except OSError:
                break
            if not data:
                break
            buf += data
            out += data
            if idx < len(answers):
                needle, resp = answers[idx]
                if needle in buf.lower():
                    time.sleep(0.3)
                    os.write(master, (resp + "\n").encode())
                    idx += 1
                    buf = b""
        else:
            wpid, _ = os.waitpid(pid, os.WNOHANG)
            if wpid != 0:
                break
    try:
        os.waitpid(pid, 0)
    except OSError:
        pass
    return out.decode(errors="replace")


def register(email, password):
    """Create/login a surge account via pty (token cmd persists ~/.netrc)."""
    log(f"[auth] registering/login as {email} ...")
    out = pty_run(["token"],
                  [(b"email:", email), (b"password:", password)],
                  timeout=90)
    log(out[-300:])
    return has_credentials()


def slugify(name):
    base = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-")
    base = re.sub(r"-+", "-", base) or "page"
    return base[:40]


def stage(src):
    """Return a directory that contains index.html for publishing."""
    src = os.path.abspath(src)
    if os.path.isdir(src):
        if os.path.exists(os.path.join(src, "index.html")):
            return src, False
        # find first html, copy as index.html into a staging dir
        htmls = [f for f in os.listdir(src) if f.lower().endswith(".html")]
        if not htmls:
            raise RuntimeError("no .html file found in directory")
        d = tempfile.mkdtemp(prefix="surge-stage-")
        for f in os.listdir(src):
            s = os.path.join(src, f)
            if os.path.isfile(s):
                shutil.copy(s, os.path.join(d, f))
        shutil.copy(os.path.join(src, htmls[0]), os.path.join(d, "index.html"))
        return d, True
    # single file
    d = tempfile.mkdtemp(prefix="surge-stage-")
    shutil.copy(src, os.path.join(d, "index.html"))
    return d, True


def deploy(stage_dir, domain):
    r = subprocess.run([SURGE_LINK, stage_dir, domain], env=ENV,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       text=True, timeout=180)
    return r.stdout


def check(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "html2surge"})
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.getcode(), len(resp.read())
        except Exception as e:
            log(f"[check] attempt {i+1} failed: {e}")
            time.sleep(2)
    return 0, 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--domain", default="")
    ap.add_argument("--register", default="")
    args = ap.parse_args()

    ensure_surge()

    # Auth
    email = whoami() if has_credentials() else None
    if not email:
        if args.register and ":" in args.register:
            em, pw = args.register.split(":", 1)
        else:
            em = "h2s%d@mailinator.com" % int(time.time())
            pw = "H2S%dpwd" % int(time.time())
        if not register(em, pw):
            print(json.dumps({"ok": False, "error": "auth failed"}))
            sys.exit(1)
        email = whoami()

    # Domain
    domain = args.domain.strip()
    if not domain:
        stem = os.path.splitext(os.path.basename(os.path.abspath(args.src.rstrip("/"))))[0]
        domain = f"{slugify(stem)}-{int(time.time()) % 100000}.surge.sh"
    elif not domain.endswith(".surge.sh"):
        domain = slugify(domain) + ".surge.sh"

    stage_dir, temp = stage(args.src)
    log(f"[deploy] {args.src} -> https://{domain}")
    out = deploy(stage_dir, domain)
    log(out[-400:])
    ok = "Success" in out or "published" in out.lower()

    url = f"https://{domain}"
    http, size = check(url) if ok else (0, 0)
    if temp:
        shutil.rmtree(stage_dir, ignore_errors=True)

    result = {"ok": ok and http == 200, "url": url, "domain": domain,
              "http": http, "size": size, "account": email}
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()

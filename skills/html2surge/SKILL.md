---
name: html2surge
description: Publish a static HTML file (or folder) to surge.sh and return a public, shareable URL. USE WHEN the user has just had an HTML page/artifact/poster/one-pager generated and agrees to deploy it, or explicitly asks to "deploy/publish/host this HTML", "put it online", "give me a public URL", "deploy to surge". Proactively ask once after generating any standalone HTML whether to publish it; only run on confirmation. DO NOT USE for non-HTML apps needing a build step, server-side runtime, or when the user wants a private/internal-only link.
---

# HTML2Surge

Deploy standalone static HTML to **surge.sh** and hand back a public URL. Surge
is free, gives a `*.surge.sh` HTTPS subdomain on a global CDN, and needs no
build step — ideal for one-pagers, posters, dashboards, slides, and artifacts.

## When to trigger

1. **Proactive offer (primary flow):** Right after you generate a standalone
   HTML file for the user, ask **once**: *"要不要我把它部署到 Surge,给你一个公网可访问的链接?"* (adapt to the user's language).
   - Only proceed on an affirmative answer.
   - If the user declines, drop it — do not ask again for the same file.
2. **Explicit request:** The user says deploy / publish / host / "give me a
   public URL" / "上线" / "发到 surge" for an existing HTML file.

Do **not** trigger for things that need a server runtime, a bundler/build
(e.g. raw React/Vite source), or that the user wants kept private.

## How to deploy

Run the bundled helper. It installs surge if missing, handles first-time
account registration through a pseudo-terminal (surge reads the password from
`/dev/tty`, so plain pipes fail), reuses stored credentials on later runs,
copies a lone `*.html` to `index.html` so the root domain serves it, deploys,
verifies HTTP 200, and prints a JSON result on the last line.

```bash
python3 <SKILL_DIR>/scripts/deploy.py --src /abs/path/to/page.html
```

Useful flags:

| Flag | Purpose |
|------|---------|
| `--src` | **Required.** Absolute path to an `.html` file, or a directory containing one. |
| `--domain` | Desired subdomain, e.g. `my-report` → `my-report.surge.sh`. Omit to auto-generate `<slug>-<n>.surge.sh`. A bare name is slugified and `.surge.sh` appended automatically. |
| `--register` | `email:password` to create/login an account. Only needed the very first time on a fresh environment; afterwards credentials persist in `~/.netrc`. |

The last stdout line is JSON, e.g.:

```json
{"ok": true, "url": "https://my-report.surge.sh", "domain": "my-report.surge.sh", "http": 200, "size": 40406, "account": "..."}
```

Parse that line, then report the `url` to the user. If `ok` is `false`, read
the stderr log the script emitted and surface the failure.

### Choosing the domain
- If the user names one, pass it via `--domain`.
- Otherwise derive a short, meaningful slug from the page title/topic (don't
  leave it fully random) and confirm the final URL in your reply.
- Domains are global across all surge users; if a deploy reports the name is
  taken, retry with a more specific slug.

## After deploying

Reply with:
1. The **public URL** as a plain clickable link (the URL is the answer — do
   not wrap it as a citation).
2. A one-line confirmation that it returned HTTP 200 / is live.
3. Optionally offer an inline preview (the page renders in-browser at the URL).

Keep it short. Do not paste the raw JSON or the surge edge-node table.

## Updating & managing an existing deploy

Same domain + new content = overwrite. Other lifecycle commands (run with
`PATH="$HOME/.npm-global/bin:$PATH"`):

| Task | Command |
|------|---------|
| Re-deploy / update | `python3 <SKILL_DIR>/scripts/deploy.py --src <path> --domain <name>` |
| List your projects | `surge list` |
| List revisions | `surge list <domain>` |
| Roll back one revision | `surge rollback <domain>` |
| Bust CDN cache | `surge bust <domain>` |
| Take a site down | `surge teardown <domain>` |
| Who am I | `surge whoami` |

## Notes & limits

- **Static only.** No server code, no build step. For SPA client-side routing,
  add a `200.html` fallback alongside `index.html`.
- **Persistence.** Credentials live in `~/.netrc` and `$HOME` is persistent, so
  authentication is a one-time cost per environment.
- **Free tier** covers HTTPS, custom `*.surge.sh` subdomains, and CDN. Custom
  apex domains and some analytics need a paid plan.
- **First-run cost.** First ever deploy installs the npm package (~6s) and
  registers an account via pty; subsequent deploys are a single fast command.

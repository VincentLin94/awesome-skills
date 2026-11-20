# Source Retrieval Subskill — authentic-first travel research

Purpose: gather **real-traveler** intelligence for each candidate route, in a
repeatable order that puts social sources ahead of ad-polluted web search. Run
this once per route. When researching many routes, dispatch one research agent
per route in parallel (see "Parallelizing" at the bottom).

## Source priority (lead → fallback)

1. **Sensight social search** — 小红书, 微博, 微信公众号, Twitter/X. Real photos,
   receipts, GPS tracks, complaints. This is the lead source.
2. **Reddit / specialist forums** — fetch directly (web fetch / browser) for
   English-language self-drive subreddits (r/travel, r/newzealand, r/CampingandHiking,
   destination subs). Honest, downvote-filtered.
3. **Web search** — only to fill gaps Sensight/Reddit didn't cover, and to
   cross-check hard numbers (prices, opening dates, road closures). Treat the
   first page as ads until proven otherwise; open the actual source page, never
   trust the snippet.

Rule of thumb: if a "fact" appears only in web-search marketing copy and nowhere
in social/forum posts, flag it as soft, don't headline it.

## Sensight — use the bundled helper

The fastest, most reliable way to pull social content is the bundled script
`scripts/sensight_fetch.py`. It wraps the Sensight skill and handles the two
things that otherwise trip you up — authentication and empty multi-platform
queries — automatically. Run it once per route:

```bash
python3 scripts/sensight_fetch.py \
  --query "新西兰南岛 自驾 攻略 路况 库克山" \
  --platforms 2 3 4 1 --size 20 --out s_nzsouth.json
```

Platform IDs: `1`=Twitter/X, `2`=小红书, `3`=微博, `4`=微信公众号. It prints a
compact preview (item count + first snippets) to stdout and saves the full JSON
to `--out`, so you get signal without pulling a huge blob into context.

### Auth (do it once per session, environment-agnostic)

Sensight may require authentication before social actions return data. The helper
attempts this for you when you pass a credential — it does **not** assume any
particular company or environment:

- **Email-based environments:** pass `--email <your-email>` (or set
  `$SENSIGHT_EMAIL`). The helper calls Sensight's email auth and retries.
- **Feishu/Lark environments:** pass `--union-id <feishu_union_id>`. If obtaining
  the union_id itself triggers an authorization card, complete it first.
- **Device-code / interactive environments:** if Sensight still demands
  interactive login, the helper exits with code `2` and prints the `auth_url` to
  stderr. Relay that URL to the user, wait for them to confirm, then re-run.

The helper auto-discovers the installed Sensight skill. If it can't find it,
point it explicitly with `--sensight-dir <path>` or `$SENSIGHT_DIR`; if Sensight
isn't installed at all it exits with code `3` — fall back to Reddit/forums/web.

> If you ever need to call Sensight directly instead of via the helper, the skill
> lives wherever your harness installed it (search for `scripts/sensight.py`); its
> own SKILL.md documents `social_search` and `search_author_posts`.

### Time-window caveat

`social_search` covers roughly the **last ~2 days** of platform activity. For
evergreen trip research that's fine — durable 攻略 posts keep resurfacing. If a
query comes back empty, the helper already degrades for you (see below); you can
also just rerun with a simpler query.

### How the helper degrades (so you don't have to)

A multi-platform query sometimes returns empty. The helper walks this ladder
automatically and stops at the first rung that yields content:

1. All requested platforms, full query.
2. Single richest platform (小红书) + a simplified query (destination + intent).
3. 小红书 with the time window dropped.

If all rungs come back empty, it tells you to fall back to non-social sources for
that route, and notes the gap.

### Saving and parsing results

The helper writes full JSON to `--out`. To pull specific fields without re-reading
the whole file into context, use `jq`:

```bash
jq -r '(.items // .posts // .data)[]?.content' s_nzsouth.json | head -40
```

Extract per route: highlights, complaints/避坑, self-drive notes, any prices, and
**1–3 short verbatim quotes with platform attribution** for the deliverable.

## Per-route extraction checklist

For every route, the research must yield:

- [ ] **Experience signal** — what travelers love / warn about (+1–3 attributed quotes)
- [ ] **Self-drive** — distance, vehicle, road difficulty, 左舵/右舵, parking/fuel/charging, permits
- [ ] **Cost lines** — airfare, rental, fuel, lodging, tickets, visa/insurance → all-travelers total
- [ ] **Budget verdict** — 达成 / 偏紧 / 超预算, with a concrete cost-cut lever
- [ ] **Day skeleton** — ordered stops, one-line "why" each (feeds the day-cards)

## Parallelizing across routes

When researching ≥3 routes, spawn one general-purpose research agent per route in
a single message. Brief each agent self-containedly: the route, the dates/season,
the budget to grade against, the traveler count, and that it must (a) use
`scripts/sensight_fetch.py` for social-first research per this file (passing
whatever auth credential is available in the environment), (b) return the
per-route checklist above as structured text — **conclusions only, no raw JSON
dumps**. Wait for all to return, then build. This keeps intermediate output out
of the main thread.

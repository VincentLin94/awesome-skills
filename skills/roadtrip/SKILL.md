---
name: roadtrip
description: >-
  Build a high-quality, interactive self-drive (租车自驾) travel route plan and
  deliver it as a polished interactive HTML "travel map". Use this whenever the
  user asks to plan, research, compare, or remake a trip / road trip / 旅行路线 /
  自驾路线 / 旅游攻略 / travel itinerary, especially when they care about real
  traveler experiences over ads, want multiple route options compared, a budget
  breakdown, or a visual/interactive deliverable. Prioritizes authentic social
  sources (小红书/微博/微信公众号/Reddit/Twitter via Sensight) over ad-polluted
  web search, treats rental-car self-drive as a first-class planning axis,
  produces a per-route cost estimate, and renders an interactive map report via
  the frontend-design skill. Trigger even if the user doesn't say "HTML" — any
  request to "plan a trip / 规划路线 / 重制路线 / 帮我选几条路线" qualifies.
---

# Roadtrip — Interactive Self-Drive Travel Atlas

This skill turns a travel-planning request into a research-backed, **interactive
HTML travel map** centered on **rental-car self-drive**. It exists because good
trip plans depend on two things that are easy to get wrong: (1) sourcing from
real travelers instead of SEO/ad content, and (2) being honest about money and
driving logistics. The workflow below bakes both in.

The job has three phases. Do them in order — don't jump to building the page
before parameters are locked and research is gathered, or the deliverable will
be "粗糙" (rough) and need a remake.

```
Phase 1  Lock parameters  →  Phase 2  Research (subskill)  →  Phase 3  Build deliverable
         (ask if missing)     (social sources first)           (frontend-design HTML map)
```

---

## Phase 1 — Lock the required parameters

A route plan is only as good as its constraints. Before any research, make sure
you have the parameters below. **If a required one is missing and can't be
inferred from context, ask the user — do not guess and barrel ahead.** Guessing
budget or dates wastes a full research+build cycle.

### Required (must have before proceeding)

| Param | Why it's required | If missing |
|-------|-------------------|------------|
| **Dates / duration** | Drives season (秋景? 雪季?), daylight hours, route length | Ask: which month, how many days |
| **Budget** | Determines feasible destinations; every route is graded against it | Ask: total or per-person, and what it includes/excludes (餐饮? 购物?) |
| **Travelers** | Per-person vs total cost; car size; pace | Ask: how many people |
| **Origin** | Long-haul flight cost & routing is a big budget line | Ask: departure city |
| **Region / hemisphere preference** | Narrows candidate routes | Ask, or offer N/S hemisphere split |

### Strong defaults (apply unless the user overrides)

- **Self-drive is the default mode.** Assume the user rents a car and drives.
  Every route must be evaluated for drivability (路况, 左舵/右舵, 里程, 停车,
  加油/充电). This is a core axis, not a footnote.
- **Budget excludes dining** unless stated otherwise — confirm what's in/out.
- **Real-traveler sourcing over ads** — see Phase 2.
- **"At least 5 mature routes"** when the user asks for options, unless they
  specify a count. Prefer routes with strong, consistent positive traveler
  reviews over obscure ones.

### Capture preferences (carry them through every phase)

Note and respect stated **route preferences and expectations**: scenery type
(自然风景/秋景/雪山/海岸), pace (紧凑/休闲), exclusions (已去过的地区, 不考虑的
大洲), and any "feel" cues (避开人多/小众/经典). Re-state your understanding back
to the user in one line before building, so a wrong assumption is caught early.

When in doubt about scope, ask **one tight batch of questions**, then proceed.
Don't drip-feed questions across turns.

---

## Phase 2 — Research via the source-retrieval subskill

The differentiator of this skill is **where the data comes from**. Web search
results are SEO-bid and ad-polluted; they distort toward whoever paid. Authentic
social sources (real travelers posting photos, gripes, GPS tracks, receipts) are
the primary source. Web search is the *fallback / cross-check*, not the lead.

**Run the bundled research workflow** in `references/source-retrieval.md`. It
provides `scripts/sensight_fetch.py`, which wraps the Sensight skill
(小红书/微博/微信公众号/Twitter) with automatic authentication and empty-result
degradation, plus the web fallback chain — one repeatable per-route procedure
that works across agent environments. Read that file and follow it for **each
candidate route**.

What you must come out of Phase 2 with, **per route**:

1. **Authentic experience signal** — what real travelers actually say (highlights,
   complaints, "避坑" warnings). Keep 1–3 short real quotes per route with platform
   attribution (小红书/微博/etc.) for the deliverable.
2. **Self-drive specifics** — total drive distance, suggested vehicle, road
   difficulty, 左舵/右舵, parking/fuel/charging notes, any permits.
3. **Cost breakdown** — airfare, rental car, fuel, lodging, tickets, visa/insurance.
   Enough to total a **per-route, all-travelers estimate** and grade it against
   the budget (达成 / 偏紧 / 超预算 + how to cut cost).
4. **Day-level skeleton** — the ordered stops with a one-line "why" each, so the
   swipeable day-cards have real content.
5. **Per-spot field notes** — for **every named 景点/spot** on the itinerary,
   search and capture enough to fill its click-to-expand modal: **由来** (origin /
   history / how it formed + its name story), **看点价值** (signature views, best
   season/time, why it beats nearby alternatives), and **游客评价** (1–3
   attributed real quotes incl. honest gripes/避坑). Optionally 门票/缆车/停车/
   适游时长 and a source link. This is per-spot, not per-route — the modals must be
   real and specific, so search each spot (parallelize across spots/routes).

Parallelize research across routes (one agent per route) when you have many — it
keeps bulky intermediate output out of the main thread. See the subskill file.

---

## Phase 3 — Build the interactive deliverable

If a **frontend-design** skill is available, invoke it to render the report — it
carries a design system and quality bar. If not, follow the design tokens and
component specs in `references/output-spec.md` directly. Either way, don't hand
the user "大量文字描述"; the deliverable is a **图文并茂、交互清晰的旅行地图**.

### Build it as a render engine, not one giant hand-written file

Author the page as a small **render engine**: an `index.html` (inline CSS + JS,
the components and design system) that consumes a separate **`data.js`** holding
all the trip content (`TRIP` meta + a `ROUTES` array). The JS renders each route
by `.map()`-ing over `ROUTES` into the DOM. This is what keeps the deliverable
maintainable — content edits touch only `data.js`, never the markup — and it is
the pipeline `scripts/build_standalone.py` expects. See "Render-engine pipeline"
in `references/output-spec.md` for the `data.js` schema and the field contract.

When the trip content is ready, run the bundled build to optimize and verify the
deploy directory:

```bash
python3 scripts/build_standalone.py <work_dir>
```

It (1) converts every `assets/*.jpeg|*.jpg` to **WebP** and downscales it
(day/hero ≤1080px @ q78, food thumbs 480px @ q72 — roughly halving image bytes),
rewriting the refs in data.js + index.html; (2) **verifies** every referenced
asset exists and that zero forbidden/expiring URLs remain (hard-fails otherwise);
and (3) reports the directory deploy-ready. **The deploy artifact is the whole
working directory** (`index.html` + `data.js` + `assets/`) — ship it together so
`assets/` travels with the page; the browser loads a tiny HTML shell, preloads the
hero, and lazy-loads the rest on scroll (first paint ~1s instead of >10s for a
base64 single file). A single self-contained file is an opt-in fallback
(`--inline`, slower first paint) for the rare one-file hand-off. Read the script's
pipeline notes in `references/output-spec.md` before first use.

Follow `references/output-spec.md` for the exact structure, the interactive
components that are mandatory, and the design tokens
(parchment/topographic field-journal aesthetic, north=秋色 ochre vs
south=spring teal). Key requirements to honor:

- **Write from the traveler's perspective — no filler, no meta-commentary.** Every
  line of copy must give the traveler something to act on or feel. Cut any sentence
  that narrates the obvious or describes the artifact instead of the trip:
  "图上那条虚线就是全程自驾轨迹", "逐日细节见下方行程卡片", "本图展示了……",
  "如图所示", "以下是……的介绍" — all forbidden. **Also forbidden: addressing the
  person who commissioned the page or narrating the making-of** — the page is a
  finished guide the traveler reads, not a task hand-off. Never write "这版是按你
  锁定的节点重排的", "按你的要求调整了……", "根据你锁定的节点", or reference
  "版本 / 这一版 / 需求 / 调整". Say the plan directly in a stable present-tense guide
  voice ("这条线的节奏:D2 从喀什直接顶到木吉乡看大地之眼"). The user reads a plan,
  not a description of a plan. A caption/intro either carries real substance (season
  window, why this order, a concrete tip) or it does not exist — when in doubt,
  delete the line rather than pad it. This applies to ALL prose: section intros,
  captions, modal text, verdicts. It is a hard quality-bar item, not a nice-to-have.
- **A hand-drawn full-route overview map is a CORE component of every guide** —
  right after the hero, before the day-card deck. It is one complete illustrated map
  of the whole route (all stops labelled, an arrowed/dashed track showing direction
  and order, a compass rose and a route banner), in a **medieval & rustic /
  乡村羊皮纸 hand-drawn style** that matches the parchment field-journal aesthetic —
  NOT a text list of legs (that duplicates the day cards below). Generate it via
  nanodraw, localize it to `assets/roadmap.jpeg`, store it as `mapImage` in the
  route object, and render it framed. If you add a caption, it must add substance
  (the season window, why the loop runs this direction) — never describe the image
  itself. See "Full-route overview map" (§roadmap) in `references/output-spec.md`.
- **Itinerary as a swipeable day-card deck**, NOT a connected node/dot map. Each
  day is a horizontally swipeable card that fuses 路线 / 路况 / 预估距离 / 驾车时间
  plus a generated destination scenery image. The old clickable SVG node map is
  deprecated — do not use it. **One card = exactly ONE day, and one swipe / one
  prev-next click = exactly one card** (full-deck-width cards that snap, so a card
  can never be truncated at the viewport edge). Split a 13-day trip into 13
  single-day cards (`DAY 1` … `DAY 13`), never a `DAY 6–7` range.
- **Load fast on an image-heavy page.** Keep images as external `assets/` refs
  (not base64), `loading="lazy"` on every below-the-fold image (day/food/modal),
  and preload the hero — the LCP element — with `<link rel="preload" as="image"
  href="assets/hero.webp" fetchpriority="high">` in `<head>` (do NOT lazy-load the
  hero). The build converts images to WebP + downscales them. Together these take
  first paint from >10s to ~1s. See "Load-speed markup the engine MUST carry" in
  `references/output-spec.md`.
- **Multi-plan output gets a sticky top route-nav.** When the deliverable carries
  ≥2 routes (the usual "give me options" case), pin a fixed/sticky top menu of the
  route titles so the user can jump between routes on a long page; it auto-hides
  for a single-route page. See §1b in `references/output-spec.md`.
- **Single-plan deep-dive is a separate page.** If the user later asks to 细化 /
  深入 ONE chosen route, do NOT re-emit the 5-route compare page — generate a
  standalone page for just that route (`ROUTES` has one element, so the route-nav,
  compare strip, and the bottom "🏁 最终推荐 / final verdict" ranking all auto-hide),
  going materially deeper across 交通 / 驾驶路线 / 景区环境 / 美食 / 人文 / 预算. A
  single-route guide must NOT carry a final recommendation/No.1 ranking at its foot:
  the traveler has already picked this route, so a ranking is redundant filler.
  See "Single-plan detailed page" (§single-plan) in `references/output-spec.md`.
- **Each day's header image is the unique signature view of THAT day's
  destination** — never reuse one image across days. Generate one image per day
  segment and name them `<route>_d<n>.jpeg`; the build verifies no duplicates.
- **Every named spot is click-to-expand**: each 景点 on a day-card opens a modal
  ("field note") organized as 由来 → 看点价值 → 游客评价 (+ optional practical
  line), filled with real, sourced Phase-2 research. Don't crowd the card — depth
  lives in the modal.
- **Hero top header / eyebrow** rendered verbatim as `Vincent's Roadtrip`. The
  **title must be romantic & poetic**, and the premise/description prose carries a
  tasteful lyrical touch — this is the Vincent voice. Romance the framing, never
  the data (sources & budget verdicts stay honest). Do not introduce any other
  branding line (e.g. an "Atlas Field Notes / 探险地图手记" eyebrow) — that naming
  is retired; `Vincent's Roadtrip` is the only overline.
- **Destination overview is a THREE-card cluster — 人文 / 美食 / 预算明细 — with
  the budget donut as the 预算 card.** Do NOT add a 风景/scenery card here: the
  swipeable day-cards above already carry the scenery at length, so a scenery card
  in the tail is redundant. The 美食 card enumerates the route's signature dishes
  and **every dish must show a photo** (a small generated food image), not just
  text. Lay the three cards out via frontend-design as one cohesive group.
- **Fixed footer signature**, rendered verbatim: `Powered by Vincent's Roadtrip`.
- **Size type for a 1080p (1920×1080) desktop viewport** — generous, readable
  fonts (root ≥17px, body ≈19px, no visible text below 15px). Earlier outputs
  were too small; do not shrink text to fit.

Generate real destination images via nanodraw — never ship empty image slots.

**Every resource in the HTML must be non-expiring and globally reachable.** Image
generators and internal tools return *signed, expiring, region-locked* URLs
(`x-orig-expires`, `-img-sign-`, `lk3s=`, corp hosts) that 403 once they expire or
when opened from another region — that is a broken deliverable. The build script
`scripts/build_standalone.py` keeps everything local for you (optimizes images to
WebP under `assets/`, references them by relative path) and runs the **pre-delivery
resource audit** as a hard gate. If you instead authored a single hand-written
HTML with remote image URLs, `scripts/localize_assets.py` downloads + rewrites +
audits that. See "Render-engine pipeline", "Resource portability" and
"Pre-delivery resource audit" in `references/output-spec.md`.

After writing the HTML (and its `assets/` folder) to the working directory and
passing the resource audit, **share it** — upload/deploy it with whatever
file-sharing tool your environment provides (e.g. an `upload_file` tool; for a
static site deploy the **whole directory** so `assets/` travels with the page) and
give the user the link. For a **multi-route** compare page, also give a concise
verdict table (route → budget → feasibility → recommendation rank). For a
**single-route** deep-dive, skip the ranking — deliver only that one route's
honest budget verdict inline. Conclusions come *after* the file is built and
uploaded, not interleaved with tool calls.

---

## Quality bar (what "not 粗糙" means)

- Every route is graded honestly against the budget, including ones the user
  asked for that bust it (keep them, label "超预算", give cost-cut advice).
- **All copy is written from the traveler's perspective — zero filler or
  meta-commentary.** No sentence narrates the obvious or describes the artifact
  ("图上那条虚线就是全程自驾轨迹", "逐日细节见下方行程卡片", "如图所示", "本图展示……").
  Every caption/intro/verdict either carries actionable substance or is cut.
- **A hand-drawn full-route overview map is present** — one complete illustrated
  map of the whole route in the medieval & rustic 羊皮纸 style, placed right after
  the hero, with every stop labelled and a directional track. Not a text list of
  legs (that duplicates the day cards).
- Self-drive is visible on every route (a drive card, not a sentence).
- Real social quotes are present and attributed — not paraphrased marketing.
- The itinerary is a **swipeable day-card deck** (each card carries 路线/路况/
  预估距离/驾车时间 + a **unique** per-day scenery image, no repeats) and the
  destination overview tail is a **three-card cluster — 人文 / 美食 / 预算明细**
  (no redundant 风景 card; the days already cover scenery), with the budget donut
  as the 预算 card and **every 美食 dish showing a photo** — interactive and
  image-led, not a static picture or a deprecated node/dot map.
- Type is sized for a 1080p desktop viewport — comfortably readable, nothing tiny.
- The footer carries the verbatim signature `Powered by Vincent's Roadtrip` and no
  retired "Atlas Field Notes / 探险地图手记" branding line anywhere on the page.
- Images are present and relevant.
- **Every resource is non-expiring and globally reachable** — built via
  `scripts/build_standalone.py`, which optimizes images to local WebP `assets/` refs
  and fails unless zero signed/expiring/region-locked URLs remain. The directory is
  deployed whole so `assets/` travels with the page. A page that 403s after a
  signature expires or is blocked in another region is not done.
- **Loads fast** — images stay external + lazy-loaded, the hero is preloaded, and
  the build downscales/WebP-converts them, so first paint is ~1s, not >10s.
- A clear recommendation ranking closes a **multi-route** report; a **single-route**
  deep-dive omits it entirely (the traveler already chose — a No.1 ranking is
  redundant filler and must not appear).

If any of these is missing, the deliverable isn't done.

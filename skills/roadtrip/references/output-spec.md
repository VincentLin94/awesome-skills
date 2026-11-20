# Output Spec — the interactive travel-atlas deliverable

The deliverable is an **interactive travel map**, not an essay — authored as a
render engine (`index.html` + `data.js` + `assets/`) and **shipped as the whole
directory** (the fast, portable default; a single self-contained file is an opt-in
fallback — see "Render-engine pipeline" below). If a **frontend-design** skill is
available, build it through that skill so it inherits the design system; otherwise
apply the tokens and component specs below directly. This file defines the
structure, the mandatory interactive components, and the design language so every
roadtrip report looks consistent and ships "图文并茂、交互清晰".

## Aesthetic — parchment field-journal

Parchment paper background with subtle topographic-contour texture; a hand-drawn
expedition-map feel; serif display + Chinese serif headings, light sans body.
**Color-temperature codes the hemisphere**: northern routes = autumn ochre/rust
(秋色); southern routes = spring/glacier teal. Use OKLCH.

> This skill does **not** use an "Atlas Field Notes / 探险地图手记" eyebrow or any
> similar branding line — that naming is retired. The only overline on the page is
> the hero eyebrow `Vincent's Roadtrip` (see Hero, below); the only signature is
> the footer `Powered by Vincent's Roadtrip`. Don't reintroduce the old line.

Design tokens (use as-is or tune):

```css
--paper: oklch(96.5% 0.016 85); --paper-deep: oklch(93% 0.026 80); --paper-card: oklch(98% 0.01 85);
--ink: oklch(26% 0.03 60); --ink-soft: oklch(41% 0.03 62); --ink-faint: oklch(55% 0.025 64);
--north: oklch(58% 0.15 52); --north-deep: oklch(45% 0.14 44);   /* 秋色 */
--south: oklch(53% 0.10 195); --south-deep: oklch(42% 0.085 200); /* 南半球 */
--gold: oklch(72% 0.13 70);
--go: oklch(52% 0.11 150); --warn: oklch(64% 0.14 70); --stop: oklch(55% 0.17 28); /* feasibility */
```

Fonts: Fraunces (serif display), Noto Serif SC (中文标题), Noto Sans SC (正文).
Paper texture via layered `repeating-radial-gradient` at low opacity.

## Copy discipline — traveler's perspective, zero filler

Write every word for the person taking the trip, never about the document. This is
a hard gate, applied to all prose on the page — hero premise, section intros,
figure captions, spot-modal text, budget notes, verdicts.

**Forbidden — meta-commentary that describes the artifact instead of the trip.**
Delete on sight (do not soften, delete):

- Narrating what a component obviously is: "图上那条虚线就是全程自驾轨迹",
  "本图展示了完整路线", "如图所示", "下方是逐日行程卡片".
- Cross-referencing the page's own layout: "逐日细节见下方行程卡片",
  "详见下方", "以下是……的介绍/说明", "接下来我们来看……".
- Empty scaffolding openers: "这是一份……", "本攻略将为你介绍……".
- **Addressing the commissioner / narrating the making-of, instead of speaking to
  the traveler.** The page is a finished travel guide the traveler reads — NOT a
  hand-off note back to whoever requested it. Delete any "task-delivery" voice:
  "这版是按你锁定的节点重排的", "按你的要求调整了……", "这一版把……改成了……",
  "根据你锁定的节点", "已按需求重排". These talk about the editing process and
  address the requester; the traveler doesn't care how the plan was produced. Say
  the plan directly, in a stable present-tense guide voice: not "这版是按你锁定的
  节点重排的:D2 直上木吉乡" but "这条线的节奏:D2 从喀什直接顶到木吉乡看大地之眼".
  Never reference "版本 / 这一版 / 上一版 / 需求 / 调整" anywhere in the delivered copy.

**Required — every line earns its place.** A caption or intro exists only if it
carries substance the traveler can act on or feel: the season window, why the loop
runs this direction, a concrete booking/driving tip, a sensory hook in the Vincent
voice. If a line would only restate what the neighbouring image/section already
shows, cut it — a shorter page with no filler beats a padded one. When generating
or revising copy, re-read each sentence and ask "does this tell the traveler
something, or just describe the page?"; if the latter, remove it.


## Typography & target resolution — generous, readable sizing

**Design and size the page for a 1080p desktop web viewport (1920×1080) as the
default canvas.** The page is read on a full-size browser, not a phone, so the
type must feel comfortably large at that width — earlier outputs ran too small.

Baseline scale (treat as minimums; tune up, not down):

```css
html{ font-size:18px; }                 /* root — do NOT drop below 17px */
body{ font-size:1.0625rem; line-height:1.7; }   /* ≈19px body copy */
.lead, .premise{ font-size:1.25rem; }            /* ≈22–24px intro lines */
h1,.hero-title{ font-size:clamp(2.75rem,4.5vw,4rem); line-height:1.08; }
h2,.route-title{ font-size:clamp(2rem,3vw,2.75rem); }
h3{ font-size:clamp(1.4rem,2vw,1.75rem); }
.daycard .leg-title{ font-size:1.35rem; }        /* day-card heading legible */
.daycard .fact, .legend, .quote{ font-size:1.0625rem; }  /* ≥17px, never tiny */
.eyebrow,.tag,.footer-note{ font-size:0.9375rem; letter-spacing:.04em; }  /* ≥15px even for small labels */
```

Rules: constrain main reading column to ~`72ch`/`min(1200px,92vw)` so lines stay
readable on a wide screen; never set any visible text below **15px**; legends,
captions, and chart labels must remain clearly readable (the donut legend amounts
and the day-card facts especially). When using the **frontend-design** skill,
pass these as the typographic baseline so it doesn't shrink text to fit.

## Render-engine pipeline — author as index.html + data.js, ship the directory

Author the deliverable as a small **render engine**, not as one giant
hand-written HTML blob. This is the pipeline the bundled
`scripts/build_standalone.py` expects, and it's what keeps every iteration's
quality stable — content lives in data, markup stays untouched.

```
<work_dir>/                 # ← THIS DIRECTORY is the deploy artifact (ship it whole)
  index.html      # inline <style> + <script>: the design system, the components,
                  # and the JS that renders ROUTES into the DOM. Loads content via
                  #   <script src="data.js"></script>
  data.js         # var TRIP = {...};  var ROUTES = [ {...}, ... ];   (all content)
  assets/*.webp   # every image: hero + per-day scenery + per-dish food (WebP)
```

**Ship the directory, not a single base64 file — this is a load-speed decision.**
An earlier version base64-inlined every image into one ~20MB HTML. It was
"portable" but painfully slow: the browser must download and parse the entire
~20MB blob before first paint, base64 inflates bytes ~33%, and inlining defeats
per-image lazy loading and browser caching. Measured first render was >10s — not
acceptable. The fast, still-portable approach is to **deploy the whole directory**
(index.html + data.js + assets/) so `assets/` travels with the page; the browser
then loads a tiny ~35KB HTML shell, paints immediately, preloads only the hero (the
LCP image), and lazy-loads the rest on scroll. Local relative paths
(`assets/<name>.webp`) never expire and are globally reachable as long as the folder
ships with the page — which it does for a static-site / directory deploy (e.g.
surge deploys the folder). **First paint drops from >10s to ~1s.**

A single self-contained file is still available as an opt-in fallback
(`--inline`) for the rare hand-off that truly needs one file — see below — but it
is the slow-first-paint path, not the default.

**Why two files.** index.html holds the *engine* (CSS + the `.map()` that turns
each route object into a route section). data.js holds the *content*. Editing the
trip — fixing a quote, swapping a day image, adding a dish — touches only data.js,
so the markup can't drift and a content fix can't break the layout. When the user
asks for a revision, it's almost always a data.js edit.

### `data.js` field contract

```js
var TRIP = { meta:{ days, routes, budget, mode } };  // hero stats
var ROUTES = [{
  id, hemi:"north"|"south", flag, name, sub, poetic, hero:"assets/hero.webp",
  verdict:"go"|"warn"|"stop", verdictText, budgetTotal, budgetNote,
  mapImage:"assets/roadmap.webp",                         // → hand-drawn full-route map (§roadmap) — PREFIXED with assets/
  mapCaption,                                             // OPTIONAL, substance-only (season window / why this direction); NEVER describe the image
  drive:{ dist, car, diff, side, fuel, permit },          // → drive card (C)
  ring:[{ label, amt, pct, color }], centerTotal, centerSub,  // → 预算 donut
  persp:{ culture, food },                                 // 人文 / 美食 intro copy
  foods:[{ file:"assets/<route>_food1.webp", name, desc }, ...],  // 美食 dishes — file PREFIXED with assets/
  quotes:[{ t, s }],                                       // attributed social quotes
  cutLever,                                                // budget cost-cut advice
  days:[{                                                  // → swipeable day-cards (A)
    label, title, leg, road, dist, time, why,
    img:"assets/<route>_d1.webp",                          // UNIQUE per-day header — PREFIXED with assets/
    spots:[{ name, origin, value, reviews, tips }]         // → field-note modals (A2)
  }]
}];
```

**Store every image path WITH the `assets/` prefix already in data.js** (both
`days[].img` and `foods[].file`), and reference it in the template as
`src="${d.img}"` / `src="${f.file}"`. Do **not** store a bare filename and prepend
`assets/` only in the template — the build matches `assets/...` literals to verify,
optimize, and (in `--inline` mode) inline them, so a bare filename is invisible to
it and the image 404s. (This was a real bug: every dish photo broke because foods
stored bare names.) Keep the prefix in the data and the template just echoes it.

You may author images as `.jpeg` (nanodraw output) — the build converts them to
`.webp` and rewrites these refs for you (see below). Either extension is fine in the
authored data.js; after a build the refs will read `.webp`.

### Load-speed markup the engine MUST carry

Three cheap affordances take first paint from >10s to ~1s on a image-heavy page.
They live in `index.html` and the build **warns** if they're missing:

- **Lazy-load below-the-fold images.** Every day-card image, dish photo, and modal
  image gets `loading="lazy"` so only what's near the viewport downloads. Render
  `<img class="dc-img" loading="lazy" src="${d.img}" ...>` etc.
- **Preload the hero (the LCP element) — do NOT lazy-load it.** The hero background
  is the largest above-the-fold paint; lazy-loading it would *delay* LCP. Put a
  `<link rel="preload" as="image" href="assets/hero.webp" fetchpriority="high">` in
  `<head>` so it fetches first. (Over-lazy-loading the LCP image is a known
  anti-pattern — the hero is the one image that must be eager.)
- **Keep images external, not base64.** Because we ship the directory, `<img>` uses
  real `src="assets/..."` paths; the browser can then lazy-load and cache them.
  Base64 inlining (the `--inline` fallback) loses both.

### Building / verifying the deploy

When the content is ready, run the bundled build:

```bash
python3 scripts/build_standalone.py <work_dir>
# default: optimizes images + verifies the directory is deploy-ready
```

It does three things and **refuses to pass a broken deliverable**:

1. **Optimize** — converts every `assets/*.jpeg|*.jpg` to **WebP** and downscales
   (day/hero/scenery capped at 1080px @ q78; food thumbnails at 480px @ q72), then
   rewrites the `.jpeg`/`.jpg` refs in data.js + index.html to `.webp`. WebP is
   ~25–34% smaller than JPEG at equal quality; combined with the downscale this
   roughly halves total image bytes with no visible loss. Idempotent — assets
   already WebP are left alone. Its asset regex is `[a-z0-9_]+`, so it **must** match
   numbered filenames like `nz_food5.jpeg`; an older `[a-z_]+` regex silently skipped
   them. (Skipped gracefully if Pillow is absent — `pip install --user
   --break-system-packages Pillow` to enable.)
2. **Verify** — confirms every referenced asset exists on disk (exit 5 if not) and
   that **zero** forbidden/expiring/region-locked URLs appear anywhere (exit 4).
   Local `assets/<name>.webp` refs are expected and fine — they are the point of the
   directory deliverable. Also warns (non-fatal) if a per-day header image is
   duplicated, or if the hero preload / image lazy-loading markup is missing.
3. **Report** — on a clean directory it prints the total local-asset size and tells
   you to **deploy the whole directory** so `assets/` travels with `index.html`.

**Single-file fallback** — only when a hand-off truly needs one file:

```bash
python3 scripts/build_standalone.py <work_dir> --inline
# → also writes <work_dir>/atlas_standalone.html (base64-inlined, slow first paint)
```

`--inline` additionally base64-inlines data.js and every asset and applies a hard
gate (zero un-inlined refs). It is the slow-first-paint path — prefer the directory
deploy. (`--no-optimize` skips the WebP/downscale step if you've already optimized.)

## Page structure (top → bottom)

1. **Hero**
   - **Top header / eyebrow line** (the small letter-spaced line above the title):
     render it **exactly** as `Vincent's Roadtrip`. This is the *only* overline on
     the hero — there is no "Atlas Field Notes / 探险地图手记" line (that naming is
     retired). Output it verbatim (do not translate, rename, localize, or drop it);
     style it as a small-caps / wide-tracked overline, optionally keeping a small
     compass glyph or rule flourish on either side.
   - **Title — must be romantic & poetic.** This is Vincent's
     signature: the headline is NOT a dry route label like "发达国家自驾地图". Write
     an evocative, lyrical title (one main line + optional subtitle) that conjures
     mood, season, light, and longing — e.g. imagery of 秋色/极光/星河/海岸/归途.
     Keep it concise and elegant, not purple. Pair a Chinese poetic title with a
     short serif Western line if it fits the layout.
   - **Premise & supporting copy — add tasteful poetry too.** The one-line premise
     and the descriptive blurb under the stats should carry a measured lyrical
     touch (a little rhythm, a sensory image), while still stating the honest
     facts (真实旅行者来源 / 诚实评级 / 不美化超预算). Romance the framing, never
     the data. This poetic-but-honest voice is the Vincent style and
     applies throughout the report's prose, not only the hero.
   - Key stats (天数 / 路线数 / 预算 / 模式=自驾) and a generated hero image as a
     faded background, as before.
1b. **Sticky route nav — REQUIRED when the output carries multiple plans (≥2
   routes).** A multi-plan page is long; the user must be able to jump between
   routes without endless scrolling. Render a **fixed/sticky top menu** (`position:
   sticky; top:0; z-index high`) that pins the route Titles as clickable jump
   anchors — visually the same set of titles as the at-a-glance cards (flag + 路线
   名 + No.). Clicking a title smooth-scrolls to that route's section (offset by the
   nav height); a scroll-spy highlights the route currently in view and keeps it
   in the menu's horizontal viewport. The nav scrolls horizontally on overflow so
   all routes stay reachable on a narrow window.
   - **Show this nav only for multi-plan output.** For a single-plan/detailed page
     (one route — see "Single-plan detailed page", §Single-plan) there is nothing
     to jump between, so **omit the sticky nav** (render it hidden / not at all).
     Gate it in JS on `ROUTES.length >= 2`.

   ```css
   .routenav{position:sticky;top:0;z-index:60;background:oklch(96.5% 0.016 85 /.92);
     backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
   .routenav.hidden{display:none}
   .rn-inner{display:flex;gap:.45rem;overflow-x:auto;padding:.55rem 1rem;scrollbar-width:none}
   .rn-link{flex:none;border:1px solid var(--line);border-radius:2rem;padding:.42rem .95rem;
     white-space:nowrap;cursor:pointer}
   .rn-link.active{background:var(--north-deep);color:#fff;border-color:var(--north-deep)}
   ```

   ```js
   (function(){
     var nav=document.getElementById('routeNav'), inner=document.getElementById('routeNavInner');
     if(!nav||!inner) return;
     if(!ROUTES || ROUTES.length<2){ nav.classList.add('hidden'); return; }  // single plan → no nav
     nav.classList.remove('hidden');
     inner.innerHTML='<span class="rn-brand">'+(TRIP.meta.eyebrow||'Routes')+'</span>'
       + ROUTES.map(function(r){return '<button class="rn-link" data-target="'+r.id+'"><span class="rn-no">No.'+r.rank+'</span>'+r.flag+' '+r.name+'</button>';}).join('');
     var links=[].slice.call(inner.querySelectorAll('.rn-link'));
     links.forEach(function(b){ b.addEventListener('click',function(){
       var t=document.getElementById(b.dataset.target); if(!t) return;
       window.scrollTo({top:t.getBoundingClientRect().top+window.pageYOffset-nav.offsetHeight-8,behavior:'smooth'});
     });});
     var spy=new IntersectionObserver(function(es){es.forEach(function(e){ if(e.isIntersecting)
       links.forEach(function(b){var on=b.dataset.target===e.target.id;b.classList.toggle('active',on);if(on)b.scrollIntoView({inline:'center',block:'nearest'});});
     });},{rootMargin:'-45% 0px -50% 0px',threshold:0});
     document.querySelectorAll('main#routes .route').forEach(function(s){spy.observe(s);});
   })();
   ```
2. **At-a-glance** — the N routes as a compact compare strip (hemisphere tag,
   budget range, feasibility mini-ribbon). Lets the user scan before diving in.
3. **One section per route.** Each route section opens with the **hand-drawn
   full-route overview map** (§roadmap) — the first thing the reader sees for that
   route, before the day-card deck — then the mandatory components below.
4. **Verdict — ranked recommendation, MULTI-ROUTE PAGES ONLY.** When the output
   carries ≥2 routes, close with a ranked recommendation (No.1/2/3…) and a one-line
   rationale each, honest about budget busters. **On a single-route page this block
   MUST NOT render** — the traveler has already chosen the route and clarified their
   direction, so a "🏁 最终推荐 / No.1" ranking is redundant noise that violates the
   zero-filler bar. Gate it in JS exactly like the route nav: render the final
   verdict only when `ROUTES.length >= 2` (e.g. `if(ROUTES&&ROUTES.length>=2&&window.FINAL_VERDICT){…}`);
   for a one-element `ROUTES` the block auto-omits with no code change.
5. Footer — data-source note (Sensight social + cross-checks), generated date,
   and a **fixed signature line** that must render exactly as:
   `Powered by Vincent's Roadtrip`. This signature is mandatory and
   non-negotiable — output it verbatim (do not translate, rename, localize, or
   drop it), styled as a small, faded footer credit. Do **not** add any other
   branding line beside it (no "Atlas Field Notes / 探险地图手记" eyebrow) — that
   naming is retired; this signature stands alone.

## Single-plan detailed page (when the user asks to deep-dive ONE route) {#single-plan}

The multi-plan atlas above is a **compare-and-choose** deliverable: 5 routes,
each summarized enough to rank. Once the user picks a winner and says *"细化
这条 / 把方案 X 做深 / 单独给我 X 的详细版"*, do **not** re-emit the 5-route page.
Generate a **separate, standalone HTML page dedicated to that one route**, going
materially deeper across every dimension. It reuses the same render engine and
design system — it is the same `index.html` + `data.js` pipeline with a
**one-element `ROUTES` array** — but the content is expanded, not summarized.

### How it differs from the multi-plan page

- **One route only.** `ROUTES = [theRoute]`. Because the sticky route nav (§1b),
  the at-a-glance compare strip, **and the ranked "🏁 最终推荐 / final verdict"
  block (§structure item 4)** all gate on `ROUTES.length >= 2`, they **auto-hide** —
  there is nothing to jump between, nothing to compare, and nothing to rank. A
  single-route deep-dive must NOT carry a final-recommendation block at its foot:
  the traveler has already picked this route, so a "No.1 推荐" is redundant filler
  and is forbidden. No code change needed; the engine already does the right thing
  for a single route.
- **Build & ship the same way** — `python3 scripts/build_standalone.py <work_dir>`,
  same WebP optimization + resource audit, **deploy the whole directory**, same
  footer signature.
- **Same hero/poetic voice**, but the eyebrow stays `Vincent's Roadtrip` and the
  hero now headlines the single chosen route (its 路线名 + 一句诗意定位).

### Deepen every dimension (this is the whole point)

A detail page that merely re-prints the multi-plan card is a failure. Each axis
below must carry **more researched substance** than the compare version — go back
to Phase-2 sourcing for the gaps:

- **交通 (getting there & around).** Concrete flight routing from 成都 (中转点、
  参考票价区间、时长), arrival airport → 取车点 logistics, and intra-route transfers.
  Name the realistic booking window behind the fare estimate.
- **驾驶路线 (driving).** Per-leg detail beyond the day-card summary: 总里程、
  每段 distance/drive-time、路况与坡度/弯道、左舵右舵、限速与测速、加油/充电点、
  冬季/秋季路况风险 (封路、结冰、极光夜驾), 停车与过路费. A drive card per leg, not one.
- **景区环境 (scenic-area environment).** For each 景点: 地貌与季节景观 (秋色/雪线/
  极光概率), 最佳时段与光线, 步道难度与体力要求, 人流与避坑, 设施 (厕所/补给/信号).
  Expand the per-spot field-note modals (§A2) with this extra depth.
- **美食 (food).** More dishes than the 3-card compare version, each with a photo
  (§B 美食 card rules still apply), plus 何处吃 (具体小镇/店型)、人均、当季食材.
- **人文 (culture).** History, local etiquette, festivals/events overlapping the
  travel dates, language/payment notes — beyond the one 人文 card blurb.
- **预算 (budget).** A **finer-grained breakdown** than the compare donut: line
  items by category with day-level or leg-level granularity, the booking-window
  assumption behind each estimate, and concrete 省钱/升级 levers. Keep the honest
  verdict (达成/偏紧/超预算).

### Day cards stay single-day

The swipeable deck (§A) is still **one card = one day, one step = one card**. The
detail page typically carries the same 13 single-day cards, but each card's spots,
field-note modals, and drive notes are richer. Day images remain unique per day
(`<route>_d1.webp` … `<route>_dN.webp` after the build; author them as `.jpeg` and
the build converts); regenerate or add images for any newly detailed spot rather
than reusing one across days.

### Workflow

1. Confirm which route (by name/rank) the user wants deepened.
2. Re-run Phase-2 research **scoped to that route**, filling the gaps the compare
   version skipped (per-leg driving, per-spot environment, extra dishes, finer
   budget). Parallelize across spots/legs.
3. Author a fresh `data.js` with `ROUTES = [theRoute]` carrying the expanded
   content, in the **same field contract** (extra dishes, more spots, more days'
   detail — the schema is unchanged, just fuller).
4. Build with `scripts/build_standalone.py`, pass the resource audit, **deploy the
   whole directory** (so `assets/` travels with the page), and give the user the link.

## Full-route overview map — hand-drawn, medieval & rustic {#roadmap}

A **single hand-drawn illustrated map of the whole route** is a core component of
every guide, not an optional flourish. It opens each route's section (right after
the hero, before the day-card deck) and answers "where does this whole trip go?" in
one glance before the reader starts swiping day cards.

**It is ONE illustrated image, not a text list of legs.** An earlier version
rendered the "全程 Roadmap" as a per-leg text timeline (from → to, 里程, 耗时 per
row); that duplicated the day-card deck below it and read as filler. That text-list
roadmap is **retired** — do not render legs as text here. The overview map is a
generated picture.

### Style — medieval & rustic 羊皮纸 hand-drawn (default, always)

Match the parchment field-journal aesthetic. Prompt nanodraw for an aged-parchment,
antique-cartography look: hand-inked mountains/forests/lakes as little pictorial
glyphs, an **arrowed or dashed track** tracing the route in order and showing
direction, **every stop labelled** in a hand-lettered style, a **compass rose**, a
decorative **route banner/cartouche** with the route name, and a subtle ornate
border. Sepia/ochre ink on tea-stained paper. This medieval-rustic style is the
default for every roadtrip map — do not substitute a modern/flat/vector map style
unless the user explicitly asks.

### How to produce & wire it

1. **Generate** via nanodraw — one map covering the full route (loop or
   out-and-back), with the stops, direction, compass, and banner described above.
2. **Localize** it into `assets/roadmap.jpeg` (the build converts to
   `roadmap.webp`), exactly like every other asset — never embed the signed URL.
3. **Store** the path as `mapImage:"assets/roadmap.webp"` on the route object (with
   the `assets/` prefix already in `data.js`, per the field contract).
4. **Render** it framed, as an image `<figure>`, gated on `r.mapImage`. Optional
   `mapCaption` — but per Copy discipline it must carry substance (season window,
   why the loop runs this direction, a driving note) and must **never** describe the
   image ("图上那条虚线就是……" is forbidden). If you have nothing substantive to say,
   omit the caption entirely.

```js
/* full-route hand-drawn map — opens the route section, before the day deck */
var mapHtml = r.mapImage
  ? '<section class="sec reveal"><div class="section-eyebrow">Full Roadmap · 全程手绘路线图</div>'
    + '<h2 class="section-title">🗺 全程手绘路线图</h2>'
    + '<figure class="mapfig"><img class="mapimg" loading="lazy" decoding="async" src="'+r.mapImage+'" alt="全程手绘路线图">'
    + (r.mapCaption ? '<figcaption class="map-caption">'+r.mapCaption+'</figcaption>' : '')
    + '</figure></section>'
  : '';
```

```css
.mapfig{margin:.8rem 0 0;padding:0}
.mapimg{display:block;width:100%;height:auto;border-radius:1rem;
  border:1px solid var(--line);box-shadow:0 6px 26px oklch(30% 0.04 60 /.18);
  background:var(--paper-card)}
.map-caption{margin-top:.9rem;font-size:.96rem;line-height:1.7;color:var(--ink-soft);
  font-family:var(--serif);text-align:left;padding:0 .2rem}
```

The build (`scripts/build_standalone.py`) optimizes and verifies `roadmap.webp`
like any asset; it must not be a signed/remote URL.

## Mandatory interactive components (per route)

A route section is incomplete without all of these: the hand-drawn full-route map
(§roadmap, opening the section), the swipeable day-card deck (A), the per-spot
field-note modals (A2), the budget donut in the destination cluster (B), and the
drive card (C).

### A. Swipeable day-card carousel (replaces the old clickable node map)

**Do NOT render the route as a connected SVG node/dot map anymore.** The
connected-dot polyline (numbered nodes joined by a dashed line) is deprecated and
must not be used. Instead, present the itinerary as a **horizontally swipeable
deck of day-cards** inside a single scroll region. The cards live in the same
region and the user slides left/right through them; this is the primary way the
route is read.

**One card = exactly ONE day, and one swipe/step = exactly one card.** Do NOT pack
a multi-day range (`DAY 6–7`, `DAY 9–13`) into a single card — split a 13-day trip
into 13 single-day cards (`DAY 1`, `DAY 2`, …). Each card is **full deck width**
(`flex:0 0 100%`) so only one day shows at a time and the card can never be
truncated at the viewport edge — its rounded-corner form always stays intact. The
deck snaps one whole card per gesture (`scroll-snap-stop:always`) and the prev/next
buttons advance by exactly one card. Rationale: earlier multi-day cards at fractional
width (`min(420px,82vw)`) left half-cards bleeding past the edge — that boundary
truncation is the failure mode this rule eliminates. A full-width single-day card is
roomy, so lay it out as a two-column card on desktop (image on one side, the day's
facts on the other) and stack to one column on narrow screens.

Each `.daycard` is a self-contained, image-led card that fuses the routing facts
for that **single day**:

- **Destination scenery image** (generated via nanodraw, localized) —
  the **unique** signature view of *that day's* destination in the right season.
  Generate one image per single day; **never reuse the same image across days**.
  Author them as `<route>_d<n>.jpeg` (e.g. `hokkaido_d1.jpeg` … `hokkaido_d13.jpeg`)
  so the day index is explicit; the build converts them to `.webp` and verifies
  there are no duplicate header images. Lazy-load them (`loading="lazy"`) so the
  off-screen day-cards don't block first paint. Never leave an empty slot. (For a
  13-day trip that means 13 unique day images per route.)
- **Day label + leg title** — the label is a SINGLE day (e.g. `DAY 1`, not
  `DAY 1–2`); the title is that day's destination (e.g. `札幌 → 洞爷`).
- **Embedded routing facts** woven into the card body, not a separate table:
  - **路线 / leg** — from → to (and key waypoints).
  - **路况 / road condition** — surface, difficulty, 左舵/右舵 reminder, season
    hazards (雪/落石/封路风险).
  - **预估距离 / distance** — km for the day's driving.
  - **驾车时间 / drive time** — estimated hours behind the wheel.
- A one-line "今日重点 / why" highlight.

Markup + behavior contract:

- A `.daydeck` flex track with `scroll-snap-type:x mandatory`, `overflow-x:auto`,
  and each `.daycard` at **full width** (`flex:0 0 100%`) with
  `scroll-snap-align:center` **and `scroll-snap-stop:always`** so every gesture
  lands on exactly one card and no half-card is ever left clipped at the edge.
  Cards are touch/trackpad swipeable and drag-to-scroll on desktop. Hide the deck's
  scrollbar (`scrollbar-width:none`) since navigation is via swipe/buttons/dots.
- Provide **prev/next arrow controls** (top-right of the deck header) and a **dot
  pager** that reflect the active card, plus keyboard ←/→ support. The prev/next
  buttons and dots each move by **exactly one card** — scroll to the target card's
  `offsetLeft`, do not scroll by a fixed pixel amount.
- Track the active card with an IntersectionObserver on the deck and keep a single
  `active` index that prev/next/dots/keyboard all drive through one `goTo(i)`.
- Lazy-reveal each card's image; keep the active card's facts fully legible.

```css
.daydeck{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.daydeck::-webkit-scrollbar{display:none}
.daycard{flex:0 0 100%;width:100%;scroll-snap-align:center;scroll-snap-stop:always;
  border-radius:1.1rem;overflow:hidden;display:grid;grid-template-columns:minmax(340px,42%) 1fr}
@media(max-width:760px){ .daycard{grid-template-columns:1fr} }
```

```js
document.querySelectorAll('.route').forEach(function(route){
  var deck=route.querySelector('.daydeck');
  if(!deck) return;
  var cards=[].slice.call(deck.querySelectorAll('.daycard'));
  var dots=route.querySelector('.daydots');
  var prev=route.querySelector('.daynav.prev'), next=route.querySelector('.daynav.next');
  var active=0;
  if(dots){ cards.forEach(function(c,i){ var d=document.createElement('button');
    d.className='daydot'; d.setAttribute('aria-label','Day '+(i+1));
    d.addEventListener('click',function(){goTo(i);}); dots.appendChild(d); }); }
  var setActive=function(i){ active=i; if(dots) [].slice.call(dots.children).forEach(function(d,j){d.classList.toggle('active',j===i);}); };
  // one card = one full deck width; snap to a specific card's offset (NOT a fixed px step)
  var goTo=function(i){ i=Math.max(0,Math.min(cards.length-1,i));
    deck.scrollTo({left:cards[i].offsetLeft-deck.offsetLeft,behavior:'smooth'}); setActive(i); };
  var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ setActive(cards.indexOf(e.target)); } }); },
    {root:deck, threshold:.55});
  cards.forEach(function(c){io.observe(c);});
  prev&&prev.addEventListener('click',function(){goTo(active-1);});
  next&&next.addEventListener('click',function(){goTo(active+1);});
  deck.tabIndex=0;
  deck.addEventListener('keydown',function(e){ if(e.key==='ArrowRight'){e.preventDefault();goTo(active+1);} if(e.key==='ArrowLeft'){e.preventDefault();goTo(active-1);} });
  setActive(0);
});
```

### A2. Per-spot "field note" modal (click a spot → expand rich detail)

Every named **景点 / spot** that appears on a day-card must be **clickable to open
a modal** with a researched deep-dive — this is mandatory, not optional. The
day-card stays compact (image + routing facts + the spot names as tappable chips);
the depth lives in the modal so the deck doesn't get crowded.

Mark each spot as a `.spotchip` carrying `data-spot` (and ideally a small
generated thumbnail). Clicking it opens a `.spotmodal` overlay. Organize the
modal content in this narrative order (adapt freely to what research actually
turned up — don't invent facts to fill a section):

- **由来 / Origin & story** — how the place came to be / its name, history, or the
  natural process that formed it. Give it a little of the romantic, lyrical
  Vincent voice.
- **看点价值 / Why it's worth it** — the signature views, the best season/time of
  day, what makes it special vs. nearby alternatives, photo spots.
- **游客评价 / Real traveler verdict** — 1–3 **attributed** real quotes pulled
  from social sources (小红书/微博/微信/Reddit/Twitter via Sensight), including
  honest gripes and 避坑 warnings — not paraphrased marketing.
- Optional: a practical line (门票/缆车/停车/适游时长) and a source citation link.

Content for these modals comes from Phase 2 research (see SKILL.md / the
source-retrieval subskill) — **search per spot** and store the highlights so each
modal is real, specific, and sourced. Localize any modal images like all others.

Behavior contract:

- A single shared `.spotmodal` per page (or per route) is fine — populate it from
  the clicked chip's data. Open on click; close on overlay click, ✕ button, and
  `Esc`. Trap nothing fancy — just restore scroll and focus.
- The chips are keyboard-focusable (`<button>`/`tabindex`), and the modal is
  scrollable if content is long.

```js
const spotModal=document.querySelector('.spotmodal');
if(spotModal){
  const mTitle=spotModal.querySelector('.sm-title'), mBody=spotModal.querySelector('.sm-body');
  const open=chip=>{ const d=JSON.parse(chip.dataset.spot||'{}');
    mTitle.textContent=d.name||chip.textContent;
    mBody.innerHTML=''; // build sections that exist
    [['由来',d.origin],['看点价值',d.value],['游客评价',d.reviews],['实用',d.tips]].forEach(([h,v])=>{
      if(!v) return; const sec=document.createElement('section'); sec.className='sm-sec';
      sec.innerHTML='<h4>'+h+'</h4>'+(Array.isArray(v)?'<ul>'+v.map(x=>'<li>'+x+'</li>').join('')+'</ul>':'<p>'+v+'</p>');
      mBody.appendChild(sec); });
    if(d.img){ const im=document.createElement('img'); im.src=d.img; im.className='sm-img'; im.loading='lazy'; mBody.prepend(im); }
    spotModal.classList.add('open'); document.body.style.overflow='hidden';
  };
  const close=()=>{ spotModal.classList.remove('open'); document.body.style.overflow=''; };
  document.querySelectorAll('.spotchip').forEach(c=>c.addEventListener('click',()=>open(c)));
  spotModal.addEventListener('click',e=>{ if(e.target===spotModal||e.target.closest('.sm-close')) close(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') close(); });
}
```

### B. Destination overview cluster — 人文 · 美食 · 预算明细 (three cards)

At the **tail of each route's section** sits the "destination overview" — a
**three-card cluster**: **人文 (culture) · 美食 (food) · 预算明细 (budget
breakdown)**, the last being the animated budget donut.

**Do NOT add a 风景/scenery card here.** Earlier versions had four cards
(风景/人文/美食/预算); scenery is now dropped from the tail because the swipeable
day-cards above already carry the destination scenery at length — a scenery card
in the overview just repeats what the user has already scrolled through. The tail
should *complement* the day-cards (the human/cultural angle, the food, the money),
not re-show the views.

Lay the three cards out with the **frontend-design** skill as one cohesive group
(responsive grid: 人文 + 美食 sharing a row with the 预算 donut tile spanning
below on wide screens; stack on narrow). A reference grid:

```css
.cluster-grid{display:grid;grid-template-columns:1fr 1.2fr;
  grid-template-areas:"culture food" "budget budget";gap:1.3rem;}
.culture-card{grid-area:culture} .food-card{grid-area:food} .budget-tile{grid-area:budget}
```

#### 人文 card

The cultural/human angle of the destination — history, people, festivals, design,
the "why it feels the way it feels". A short image-led card; keep the Vincent
voice (lyrical but honest).

#### 美食 card — every dish carries a photo

The food card **enumerates the route's signature dishes** — aim for ~5 named
dishes, not a vague sentence. **Each dish MUST show a photo.** A text-only food
list is the failure mode we are eliminating, so model each dish as a small figure
with image + name + one-line description, in a responsive grid:

```css
.dish-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.9rem}
.dish img{width:100%;height:110px;object-fit:cover;border-radius:.5rem}
.dish-name{font-weight:600} .dish-desc{font-size:.95rem;color:var(--ink-soft)}
```

Generate one food image per dish via nanodraw and name them
`<route>_food<n>.jpeg` (the build converts them to `.webp`). **Store the path in
`data.js` with the `assets/` prefix already included** (e.g.
`"file":"assets/hokkaido_food1.jpeg"`), and reference it in the template as
`src="${f.file}"` with `loading="lazy"` — matching how day images are stored. (A
past bug stored bare filenames and prefixed `assets/` only in the template, so the
build's asset matcher never saw them and every dish photo 404'd. Keeping the full
relative path *in the data* is what prevents that.) The build optimizes, verifies,
and (in `--inline` mode) inlines these like any other asset.

#### 预算明细 card — the animated budget donut

An SVG ring whose segments are driven by a JSON array in `data-ring`
(`[{label,pct,color}]`: airfare/rental/fuel/lodging/tickets/visa). Build segments
in JS and animate `stroke-dasharray` on scroll-in via IntersectionObserver.
Show the all-travelers total in the center and a legend with absolute amounts.

```js
function buildRing(svg){
  const data=JSON.parse(svg.dataset.ring); let off=25; // start at top
  data.forEach(seg=>{
    const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('r',15.915); c.setAttribute('cx',21); c.setAttribute('cy',21);
    c.setAttribute('fill','transparent'); c.setAttribute('stroke',seg.color); c.setAttribute('stroke-width',6);
    c.setAttribute('stroke-dasharray','0 100'); c.setAttribute('stroke-dashoffset',off);
    c.style.transition='stroke-dasharray 1.1s cubic-bezier(.16,1,.3,1)';
    svg.appendChild(c);
    requestAnimationFrame(()=>requestAnimationFrame(()=>c.setAttribute('stroke-dasharray',`${seg.pct} ${100-seg.pct}`)));
    off-=seg.pct;
  });
}
const ringObs=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){buildRing(e.target);ringObs.unobserve(e.target);}}),{threshold:.4});
document.querySelectorAll('.ring[data-ring]').forEach(s=>ringObs.observe(s));
```

### C. Drive card (self-drive is first-class)

A `.drivecard` with: total distance, suggested vehicle, road difficulty,
左舵/右舵 reminder, parking/fuel/charging notes, permits/IDP. Never reduce
self-drive to one sentence — the user always rents and drives.

### Plus, per route

- **Feasibility ribbon** — `go` / `warn` / `stop` corner ribbon vs the budget.
- **1–3 real social quotes**, attributed (小红书/微博/微信/Reddit). These are the
  proof of authentic sourcing — don't paraphrase into marketing voice.
- **A generated destination image** (nanodraw). No empty image slots, ever.
- **Destination overview cluster** at the route's tail: the **three cards**
  人文 (culture) · 美食 (food, every dish with a photo) · 预算明细 (the budget
  donut) — see component B. No 风景 card here (scenery lives in the day-cards).
  Use the **frontend-design** skill to lay the three out as one cohesive group.

### Route-top overview chain (keep it — it's easy to lose in a rewrite)

Just under each route's title, render a one-line **路线总览 · 同城闭环** chain that
lists the day stops in order with arrows between them — a quick "where this route
goes" before the user starts swiping the day-cards. This compact overview was
dropped in a past rewrite and the user noticed immediately; keep it. Build it from
the day list, e.g.:

```js
const overview=r.days.map((d,di)=>
  `<span class="ov-node"><span class="ov-idx">${di+1}</span><span class="ov-name">${d.title}</span></span>`
).join('<span class="ov-arrow">→</span>');
// <div class="route-overview"><div class="ov-lbl">路线总览 · 同城闭环</div>
//   <div class="ov-chain">${overview}</div></div>
```

## Scroll polish

Wrap sections in `.reveal` and fade/translate them in with an IntersectionObserver
(`threshold:.1`, add class `in`). Keep it subtle.

## Images

Generate one representative image per route + one hero using whatever
image-generation tool your environment provides (e.g. a `generate_pictures` /
text-to-image tool). Prompt for the signature view of each destination in the
right season (e.g. 秋季 Moraine Lake, Hobbiton). If no image generator is
available, source a relevant openly-licensed photo instead — but never ship
empty image slots.

**Critical: never embed the raw returned URL.** Image generators and internal
tools hand back *signed, expiring, region-locked* URLs (anything with
`x-orig-expires`, `*-img-sign-*`, `lk3s=`, a TOS/OSS signature, or a host that
isn't reachable from the open internet). Those links 403 once the signature
expires or when opened from another network/region — exactly the "图片打不开"
failure we are eliminating. **Every image must be localized before it ships**
(see "Resource portability" below).

## Resource portability — every asset must be non-expiring AND globally reachable

This is a hard requirement, not a nice-to-have. A delivered HTML file that
depends on an expiring signature or a region-blocked host is **broken**, even if
it renders on your machine right now.

Rules for *every* resource the page references (images, fonts, CSS, JS, icons):

1. **No signed / expiring URLs, ever.** Forbidden in the final HTML: any URL
   containing `x-orig-expires`, `x-orig-sign`, `-img-sign-`, `lk3s=`, `Expires=`,
   `Signature=`, `X-Amz-`, or pointing at an internal/corp host
   (`*.byteintl.net`, `*.bytedance.net`, internal TOS/OSS buckets). These are
   time-bombed and/or region-locked.
2. **Localize images.** Download each generated/sourced image into the bundled
   `assets/` folder and reference it by **relative path** (`assets/<name>.webp`),
   so the bytes travel with the page when the directory is deployed. This is the
   default and the fast path — small HTML shell, cacheable, lazy-loadable. Base64
   `data:` inlining is only for the single-file `--inline` fallback (slower first
   paint), not the default.
3. **Fonts must not depend on a blocked CDN.** Google Fonts (`fonts.googleapis.com`
   / `fonts.gstatic.com`) is unreliable/blocked in mainland China. Either
   self-host the font files into `assets/fonts/` and `@font-face` them locally,
   or fall back to a robust system-font stack (e.g. serif:
   `"Songti SC","Noto Serif SC",Georgia,serif`; sans: `"PingFang SC","Noto Sans
   SC",system-ui,sans-serif`). Do not leave a hard dependency on a foreign font
   CDN.
4. **CSS/JS inline or local.** Keep the stylesheet inline in `index.html` and load
   trip content via the local `data.js` sidecar (which ships in the directory).
   Don't pull libraries from a remote CDN at runtime.

`scripts/localize_assets.py` automates steps 1–2: point it at your HTML, it
downloads every remote image (preserving the full signed URL so the download
itself succeeds) into `assets/`, rewrites the refs to relative paths, and then
**audits** the result — exiting non-zero if any forbidden/remote/expiring
reference remains. Run it before delivery.

## Pre-delivery resource audit (mandatory gate)

`build_standalone.py` already runs this gate (it exits 4 on any forbidden URL), so
a clean build is the audit. To check a hand-authored HTML separately, run
`scripts/localize_assets.py --audit <file.html>` or grep the deploy directory's
files manually:

```bash
# Must return ZERO matches. Any hit means the page will break for someone.
grep -Eo 'https?://[^"'"'"' )]+' <work_dir>/index.html <work_dir>/data.js \
  | grep -Ev '^https?://[^/]*surge\.sh' \
  | grep -Ei 'x-orig-expires|x-orig-sign|-img-sign-|lk3s=|Expires=|Signature=|X-Amz-|byteintl\.net|bytedance\.net|fonts\.googleapis|fonts\.gstatic'
```

If anything matches, localize it and re-audit. Only ship once the audit is clean.
External **citation/source links** in the report body are fine (they're
navigation, not page assets) — the audit targets resources the page loads to
render itself.

## Delivery

1. Build with `python3 scripts/build_standalone.py <work_dir>` — it optimizes
   images to WebP, **verifies** every asset exists, and **passes the resource gate**
   (or fails loudly). If you instead hand-authored a single HTML with remote image
   URLs, run `scripts/localize_assets.py` to download+rewrite+audit it first.
2. The shipped artifact is the **whole working directory** (`index.html` +
   `data.js` + the `assets/` folder) — deploy it together (e.g. surge deploys the
   folder) so `assets/` travels with the page and the browser can lazy-load and
   cache images. Only if a hand-off truly needs one file, build with `--inline` to
   also emit `atlas_standalone.html` (base64, slower first paint).
3. Share it via your environment's file-upload/deploy tool and give the user the
   link.
4. **Multi-route pages only:** close with a compact **verdict table**: route →
   budget range → feasibility → recommendation rank. State the No.1 pick and why in
   one line. Keep budget busters in the report but labeled, with a cost-cut lever.
   **On a single-route deep-dive, skip the ranking entirely** — there is only one
   route and the traveler already chose it; a "No.1 推荐" verdict is redundant
   filler (see §structure item 4 and §single-plan). Deliver the honest budget
   verdict for that one route inline instead.

Conclusions come after the build+upload, never interleaved with tool calls.

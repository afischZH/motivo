# PROGRESS.md: Logbuch des Orchestrators

> Wird vom Orchestrator gepflegt (siehe `ORCHESTRATOR.md`). Neueste Einträge oben. Jede Sitzung endet mit einem aktuellen "Nächster Schritt".

## Aktueller Stand

- **Meilenstein**: M2 (freigegeben 2026-10-27 mit Empfehlungen: Cloudflare Web Analytics, Sentry EU gratis, Warteliste mit Supabase + Resend am Schluss). M1 abgenommen und live seit 2026-10-27 (PR #2, Merge e56e13f). M0 live seit 2026-10-27.
- **Letzte Sitzung**: 2026-10-27 (Cloud-Sitzung)
- **Nächster Schritt**: Welle 1 (AP01, AP02, AP05, AP07) läuft; danach integrieren, dann Welle 2 (AP06, AP08, AP11). Domain und Impressum-Angaben von Andreas noch offen.
- Offen für vor Launch: CSP und Security-Header (Theme-Script per sha256 erlauben), als M2-AP11 eingeplant.

## Arbeitspakete des aktuellen Meilensteins

### M2: SEO-Seiten, mehr Tools, Beta (freigegeben 2026-10-27)

| ID | Titel | Agent | Status | Abhängig von | Notiz |
|---|---|---|---|---|---|
| M2-AP01 | Tools **Grid Patterns**, **Confetti**, **Starry Sky**, **Dieter Dots** | engine-dev | geplant | – | Confetti/Starry Sky mit Poisson-Disk (seeded); Limits gegen Einfrieren wie bei Polka Dots |
| M2-AP02 | Tool **Noise/Grain** | engine-dev | erledigt (Cross-Browser in AP12) | – | Gauss-Kachel 256 px als PNG im SVG-Pattern (kein feTurbulence, rendert je Browser anders); Code in engine statt effects; SVG 90 bis 260 KB |
| M2-AP03 | **CSS Pattern Library** (Dots, Grid, Stripes, Waves, Geometric) inkl. eigener Seite pro Muster | engine-dev + ui-dev | geplant | AP08 (Template) | Eigene, frei entworfene Muster (Clean-Room); Exporte CSS, Tailwind, SVG, PNG |
| M2-AP04 | **CSS Pattern Editor** mit Ebenen | ui-dev | geplant | AP03 | Neuer Control-Typ Ebenenliste |
| M2-AP05 | Farb-Tools **Palette Generator**, **Tints & Shades**, **Tailwind Palette** | engine-dev + ui-dev | geplant | – | OKLCH, WCAG-Kontrast; Export `tailwind.config.js` und v4 `@theme`; braucht Paletten-Vorschau in der Shell |
| M2-AP06 | **Palette aus Bild** | engine-dev | geplant | AP05 | k-means in OKLab im Worker, Bild bleibt im Browser |
| M2-AP07 | i18n: lokalisierte Slugs, hreflang, FR/IT vorbereitet | ui-dev | geplant | – | FR/IT nur Struktur, Texte später |
| M2-AP08 | SEO: Landing-Template je Tool, Katalog, Kategorien, Sitemap, JSON-LD, dynamische OG-Bilder | ui-dev | geplant | AP07 | OG-Bilder zur Build-Zeit oder im Worker, keine laufenden Kosten |
| M2-AP09 | Startseite, Impressum, Datenschutz, Analytics, Sentry | ui-dev | geplant | AP08 | Rechtstexte "juristisch zu prüfen"; Analytics/Sentry nach Entscheid Andreas |
| M2-AP10 | **Founders-Warteliste** (Double Opt-in, Zähler) | backend-dev + security-reviewer | geplant, Entscheid offen | – | Neue Tabelle (Supabase EU, RLS) und E-Mail-Versand: Stopp-Punkte |
| M2-AP11 | CSP und Security-Header | security-reviewer + ui-dev | geplant | – | Aus M1-Review |
| M2-AP12 | Lighthouse ≥ 95, QA in 3 Browsern, Code- und Security-Review | qa-tester + reviewer | geplant | alle | Domain, DNS, Search Console durch Andreas |

Reihenfolge: zuerst parallel Tool-Strang (AP01, AP02, AP05, AP06) und Seiten-Strang (AP07, dann AP08, dann AP03/AP04 und AP09); AP10 und AP11 parallel, sobald entschieden; zum Schluss AP12.

### M1: Editor-Shell + erste Tools (abgeschlossen)

| ID | Titel | Agent | Status | Abhängig von | Notiz |
|---|---|---|---|---|---|
| M1-AP01 | `ToolDefinition`-Typen, Registry, Test-Helfer (Schema-, Preset-, Snapshot-Tests generisch) | engine-dev | erledigt | – | Dep: zod 4 (ca. 27 KB gzip); 82 Tests |
| M1-AP02 | Editor-State: Params, Seed, Locks, Randomize, Undo/Redo, Varianten-Verlauf | ui-dev | erledigt | AP01 | Dep: zustand 5 (ca. 0.4 KB gzip); Preset erzeugt neue Variante; Locks und Filmstreifen nicht im Undo |
| M1-AP03 | Auto-Controls aus Zod-Schema (Slider, Segmented, Switch, Farbe, Palette) inkl. Schloss | ui-dev | erledigt | AP01 | Farbwähler ohne OKLCH-Tabs, Palette per Knöpfe statt Drag, Reset per Doppelklick (Tastatur folgt); 116 Tests |
| M1-AP04 | Editor-Seite `/[locale]/tools/[toolId]`: Layout, Presets-Leiste, Vorschau mit Zoom/Fit, Filmstreifen, Tastaturkürzel | ui-dev | erledigt | AP02, AP03 | EditorShell in editor-ui; Mobile einspaltig statt Bottom-Sheet; ⌘K, ⌘S, ⌘⇧C fehlen noch; Preset-Thumbnails als data-URL im HTML (Polka Dots ca. 34 KB gzip), in AP12 prüfen |
| M1-AP05 | Exporter SVG, CSS, PNG/JPG/WebP (freie Grösse, gross im Worker), Clipboard + Export-Dialog | engine-dev + ui-dev | erledigt | AP01, AP04 | `@motivo/exporters` (SVG, CSS, Raster im Worker, Clipboard), Extra-Exporte Tailwind und clip-path; ohne SVGO; iOS-Canvas-Limit ca. 16.7 MP |
| M1-AP06 | Teilen per URL-Hash (Params komprimiert) | ui-dev | erledigt | AP02 | Dep: fflate 0.8 (ca. 4.1 KB gzip); Format Version + DEFLATE + base64url, Limits 8 KB / 64 KB |
| M1-AP07 | Tool **CSS Gradient** (linear/radial/conic, Easing, OKLCH) | engine-dev | erledigt (Cross-Browser in AP12) | AP01 | Dep: culori 4 via `culori/fn` (ca. 1.3 KB gzip); Stopps gleichmässig, ziehbare Stopps später (neuer Control-Typ) |
| M1-AP08 | Tool **Blob** | engine-dev | erledigt (Cross-Browser in AP12) | AP01 | Füllung solid/outline/gradient; clip-path-CSS kommt mit AP05-Hook |
| M1-AP09 | Tool **SVG Waves** | engine-dev | erledigt (Cross-Browser in AP12) | AP01 | Param `coverage`, Standard 1920×1080 |
| M1-AP10 | Tool **Polka Dots** | engine-dev | erledigt (Cross-Browser in AP12) | AP01 | Abstand relativ zur kürzeren Kante; Params shape, colorMode, jitter |
| M1-AP11 | 6 **Konverter**-Seiten (SVG↔CSS, SVG↔Base64, Bild↔Base64) | ui-dev | erledigt (Security-Review in AP12) | – | Nutzer-SVG nur per `<img>` mit data-URI; Typ per Magic Bytes, 5 MB Limit, Web Worker; Sitemap/Changelog folgen in M2 |
| M1-AP12 | Snapshot-Tests je Preset, visueller Test Vorschau == PNG-Export in 3 Browsern | qa-tester | erledigt | AP05, AP07 bis AP10 | Vorschau == PNG je Tool in Chromium, Firefox, WebKit grün (Kantenglättung toleriert, echte Abweichung ≤ 0.02 %); axe, Tastatur, Hell/Dunkel, 375/768/1280 px geprüft |

Entscheide Orchestrator 2026-10-27: AP05 erhält einen Hook für Zusatz-Exporte pro Tool (Tailwind, clip-path); ziehbare Verlaufsstopps nach M1; i18n-Test in tool-registry liest `apps/web/messages` direkt (vorerst akzeptiert).

Reihenfolge: AP01, dann parallel Engine-Strang (AP07 bis AP10) und UI-Strang (AP02, AP03, dann AP04), danach AP05, AP06; AP11 jederzeit parallel; zum Schluss AP12 und Reviews (code-reviewer; security-reviewer für Konverter und URL-Hash).

Bewusst **nicht** in M1 (laut Roadmap später): Speichern/Accounts (M3), Export-Events in DB (M3), Gating/Wasserzeichen (M4), Brand-Paletten (M3).

### M0 (abgeschlossen)

| ID | Titel | Agent | Status | Abhängig von | Notiz |
|---|---|---|---|---|---|
| M0-AP01 | Monorepo-Grundgerüst: pnpm-Workspaces, Turborepo, `packages/config` (tsconfig strict, ESLint, Prettier), leere Pakete gemäss ARCHITECTURE.md 3 | Orchestrator | erledigt | – | Basis für alles |
| M0-AP02 | `apps/web`: Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui | ui-dev | erledigt | AP01 | Versionen per offizieller Doku prüfen |
| M0-AP03 | Lint-Regel "kein `Math.random`/`Date.now` in engine/effects/shaders", Husky + lint-staged | Orchestrator | erledigt | AP01 | |
| M0-AP04 | Vitest + Playwright einrichten, GitHub Actions (lint, typecheck, test, build) | qa-tester | erledigt | AP01, AP02 | |
| M0-AP05 | Design-Tokens Light/Dark, Basis-Layout, Theme-Switch (⌘⇧K), i18n-Grundgerüst DE/EN | ui-dev | erledigt | AP02 | Texte nur über i18n-Keys |
| M0-AP06 | `packages/engine`: PRNG `mulberry32`, Vektor-Helfer, Catmull-Rom zu Bezier, Poisson-Disk, je mit Unit-Tests | engine-dev | erledigt | AP01 | parallel zu AP02 bis AP05 |
| M0-AP07 | Deployment: Cloudflare Workers via OpenNext, Preview pro Branch, Production auf `main` | Orchestrator | erledigt | AP02, AP04 | Konfiguration fertig und lokal in workerd getestet; Workers Builds am 2026-10-27 verbunden (Projekt `motivo-web`, Path `apps/web`, Build `pnpm cf:build`, NODE_VERSION 22). Erster Production-Build scheiterte, weil `main` noch keine App enthält. workers.dev und Preview URLs im Dashboard aktiviert; Git-Verbindung nach Clone-Fehlern neu verbunden (Token `motivo`); Workers Builds scheitert ab ca. 07:15 UTC dauerhaft beim Klonen. Plan B (Entscheid Andreas): Deploy über GitHub Actions (`.github/workflows/deploy.yml`), Secrets `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID`; Preview-URL-Muster `<branch>-motivo-web.andreas-65d.workers.dev` |

Reihenfolge: AP01, dann parallel AP06 (engine) und AP02 (web), danach AP03, AP04, AP05, zum Schluss AP07. Quality Gates je AP: lint/typecheck/test, code-reviewer.

## Blocker und offene Fragen an Andreas

- Offen (niedrig, aus Code-Review M0): Sprachwechsel übernimmt Query/Hash nicht (relevant ab Editor-URLs in M1). Inline-Theme-Script braucht Nonce/Hash, sobald CSP kommt. Firefox öffnet evtl. Konsole bei Ctrl+Shift+K.

## Kostenentscheide (Lifetime-Ökonomie)

| Datum | Feature | Laufende Kosten (Schätzung) | Lösung (clientseitig / Credits / Fair Use) |
|---|---|---|---|

## Werkzeug-Status

| Werkzeug | Verfügbar? | Notiz |
|---|---|---|
| Supabase MCP/CLI | MCP ja (Cloud) | CLI nicht geprüft |
| Vercel MCP/CLI | MCP ja (Cloud) | nicht mehr benötigt (Hosting Cloudflare) |
| Cloudflare | wrangler lokal ja | Cloudflare-API aus der Cloud-Sitzung blockiert; Deploy über Workers Builds |
| Stripe CLI | nein | Fallback: Fixtures mit signierten Test-Events (erst ab M4 nötig) |
| Playwright | ja (Cloud-Container) | Chromium vorinstalliert |
| shadcnspace MCP | nein | Fallback: shadcn/ui + Tailwind |
| Impeccable | nein | Fallback: DESIGN.md manuell prüfen |
| GitHub-Repo | ja | `afischZH/motivo` (privat), seit 2026-10-27 Quelle der Wahrheit |
| pnpm | nein (auf dem verbundenen Rechner nicht gefunden) | wird in M0 installiert |

## Sitzungsprotokoll

### 2026-10-27
- Erledigt: Sitzungsstart-Ritual. CLAUDE.md, ROADMAP.md, PROGRESS.md gelesen. Kein Git-Repo, noch kein Code, daher Lint/Tests entfallen.
- Entscheide: keine.
- Repo `afischZH/motivo` angelegt (durch Andreas), Docs als erster Commit gepusht. M0-AP-Plan erstellt.
- M0 freigegeben (Hosting Cloudflare). AP01 bis AP06 umgesetzt, CI grün (Chromium, Firefox, WebKit). PR #1.
- Entscheide: TypeScript 6.0.x gepinnt; Turbopack statt webpack (engine-Imports ohne `.js`); next-intl 4 mit `/de` und `/en`; Theme ohne next-themes (Inline-Script).
- Plan B: Deploy über GitHub Actions; Preview und Production live. M0 abgenommen, PR #1 gemergt.
- Nächster Schritt: M1-AP-Plan freigeben.

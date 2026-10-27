# PROGRESS.md: Logbuch des Orchestrators

> Wird vom Orchestrator gepflegt (siehe `ORCHESTRATOR.md`). Neueste Einträge oben. Jede Sitzung endet mit einem aktuellen "Nächster Schritt".

## Aktueller Stand

- **Meilenstein**: M1 (AP-Plan erstellt, wartet auf Freigabe). M0 abgenommen und live seit 2026-10-27.
- **Letzte Sitzung**: 2026-10-27 (Sitzungsstart-Ritual, Cloud-Sitzung)
- **Nächster Schritt**: Freigabe M1-AP-Plan (inkl. Entscheid SVGO), dann M1-AP01.

## Arbeitspakete des aktuellen Meilensteins

### M1: Editor-Shell + erste Tools

| ID | Titel | Agent | Status | Abhängig von | Notiz |
|---|---|---|---|---|---|
| M1-AP01 | `ToolDefinition`-Typen, Registry, Test-Helfer (Schema-, Preset-, Snapshot-Tests generisch) | engine-dev | offen | – | Dep: zod |
| M1-AP02 | Editor-State: Params, Seed, Locks, Randomize, Undo/Redo, Varianten-Verlauf | ui-dev | offen | AP01 | Dep: zustand (+ ggf. immer) |
| M1-AP03 | Auto-Controls aus Zod-Schema (Slider, Segmented, Switch, Farbe, Palette) inkl. Schloss | ui-dev | offen | AP01 | DESIGN.md 3 |
| M1-AP04 | Editor-Seite `/[locale]/tools/[toolId]`: Layout, Presets-Leiste, Vorschau mit Zoom/Fit, Filmstreifen, Tastaturkürzel | ui-dev | offen | AP02, AP03 | DESIGN.md 2 und 4 |
| M1-AP05 | Exporter SVG, CSS, PNG/JPG/WebP (freie Grösse, gross im Worker), Clipboard + Export-Dialog | engine-dev + ui-dev | offen | AP01, AP04 | SVGO-Entscheid offen |
| M1-AP06 | Teilen per URL-Hash (Params komprimiert) | ui-dev | offen | AP02 | Dep: fflate oder lz-string |
| M1-AP07 | Tool **CSS Gradient** (linear/radial/conic, Easing, OKLCH) | engine-dev | offen | AP01 | Dep: culori |
| M1-AP08 | Tool **Blob** | engine-dev | offen | AP01 | nutzt curves.ts |
| M1-AP09 | Tool **SVG Waves** | engine-dev | offen | AP01 | nutzt curves.ts |
| M1-AP10 | Tool **Polka Dots** | engine-dev | offen | AP01 | ROADMAP M1 (TOOLS.md sagt M2/M3, ROADMAP gilt) |
| M1-AP11 | 6 **Konverter**-Seiten (SVG↔CSS, SVG↔Base64, Bild↔Base64) | ui-dev | offen | – | Nutzer-SVG nur per `<img>` anzeigen, nie inline |
| M1-AP12 | Snapshot-Tests je Preset, visueller Test Vorschau == PNG-Export in 3 Browsern | qa-tester | offen | AP05, AP07 bis AP10 | DoD M1 |

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

- Freigabe M1-AP-Plan.
- Entscheid SVGO (ca. 4.1, gross) vs. eigener schlanker SVG-Optimierer, siehe Kurzlage im Thread.
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

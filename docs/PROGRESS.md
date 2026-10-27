# PROGRESS.md: Logbuch des Orchestrators

> Wird vom Orchestrator gepflegt (siehe `ORCHESTRATOR.md`). Neueste Einträge oben. Jede Sitzung endet mit einem aktuellen "Nächster Schritt".

## Aktueller Stand

- **Meilenstein**: M0 (freigegeben 2026-10-27, Hosting Cloudflare; AP01 bis AP06 erledigt, AP07 wartet auf Cloudflare-Verknüpfung)
- **Letzte Sitzung**: 2026-10-27 (Sitzungsstart-Ritual, Cloud-Sitzung)
- **Nächster Schritt**: Andreas verbindet Cloudflare Workers Builds mit dem Repo; danach Preview-URL prüfen, M0-Abnahme.

## Arbeitspakete des aktuellen Meilensteins

| ID | Titel | Agent | Status | Abhängig von | Notiz |
|---|---|---|---|---|---|
| M0-AP01 | Monorepo-Grundgerüst: pnpm-Workspaces, Turborepo, `packages/config` (tsconfig strict, ESLint, Prettier), leere Pakete gemäss ARCHITECTURE.md 3 | Orchestrator | erledigt | – | Basis für alles |
| M0-AP02 | `apps/web`: Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui | ui-dev | erledigt | AP01 | Versionen per offizieller Doku prüfen |
| M0-AP03 | Lint-Regel "kein `Math.random`/`Date.now` in engine/effects/shaders", Husky + lint-staged | Orchestrator | erledigt | AP01 | |
| M0-AP04 | Vitest + Playwright einrichten, GitHub Actions (lint, typecheck, test, build) | qa-tester | erledigt | AP01, AP02 | |
| M0-AP05 | Design-Tokens Light/Dark, Basis-Layout, Theme-Switch (⌘⇧K), i18n-Grundgerüst DE/EN | ui-dev | erledigt | AP02 | Texte nur über i18n-Keys |
| M0-AP06 | `packages/engine`: PRNG `mulberry32`, Vektor-Helfer, Catmull-Rom zu Bezier, Poisson-Disk, je mit Unit-Tests | engine-dev | erledigt | AP01 | parallel zu AP02 bis AP05 |
| M0-AP07 | Deployment: Cloudflare Workers via OpenNext, Preview pro Branch, Production auf `main` | Orchestrator | blockiert | AP02, AP04 | Konfiguration fertig und lokal in workerd getestet; Workers Builds am 2026-10-27 verbunden (Projekt `motivo-web`, Path `apps/web`, Build `pnpm cf:build`, NODE_VERSION 22). Erster Production-Build scheiterte, weil `main` noch keine App enthält |

Reihenfolge: AP01, dann parallel AP06 (engine) und AP02 (web), danach AP03, AP04, AP05, zum Schluss AP07. Quality Gates je AP: lint/typecheck/test, code-reviewer.

## Blocker und offene Fragen an Andreas

- Cloudflare Workers Builds mit GitHub-Repo verbinden (AP07).
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
- Nächster Schritt: Cloudflare-Verknüpfung durch Andreas, dann M0-Abnahme.

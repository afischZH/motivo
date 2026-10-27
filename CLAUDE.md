# CLAUDE.md: Projektanweisungen für den AI-Coding-Agent

## Projekt in Kürze

**Motivo** (Arbeitstitel) ist eine Web-Toolbox mit 30+ Generatoren für Muster, Verläufe, Hintergründe, Bildeffekte und Farben. Nutzer erzeugen per Klick (Leertaste = neue Variante) markengerechte Grafiken und exportieren sie als PNG/JPG/WebP, SVG, CSS, GIF, MP4/WebM oder Code. Inspiriert vom Funktionsumfang von magicpattern.design, aber **eigenständig umgesetzt** (Clean-Room, siehe unten).

**Geschäftsmodell: Lifetime, kein Abo.** Free-Stufe plus einmalig gekaufte Lizenzen (Solo, Pro, Team). KI und API laufen über Credits. Details in `docs/PRODUCT.md` Abschnitt 6.

## Pflichtlektüre vor jeder Aufgabe

| Datei | Inhalt | Wann lesen |
|---|---|---|
| `ORCHESTRATOR.md` | Rolle, Ablauf und Regeln des Orchestrators; Subagents in `.claude/agents/` | Wenn du als Orchestrator arbeitest |
| `docs/PROGRESS.md` | Aktueller Stand, Arbeitspakete, Blocker | Zu Beginn jeder Sitzung |
| `docs/ROADMAP.md` | Meilensteine, Checklisten, Definition of Done | **Immer zuerst**: aktuellen Meilenstein bestimmen |
| `docs/ARCHITECTURE.md` | Stack, Monorepo, Tool-Interface, Datenmodell, Sicherheit | Vor jeder Code-Änderung |
| `docs/TOOLS.md` | Spezifikation jedes Tools (Parameter, Algorithmus, Exporte, Gating) | Vor Arbeit an einem Tool |
| `docs/DESIGN.md` | Layout, Controls, Shortcuts, Tokens, Microcopy | Vor UI-Arbeit |
| `docs/PRODUCT.md` | Vision, Personas, Pläne, Nicht-Ziele | Bei Scope-Fragen |
| `docs/ANALYSE.md` | Reverse Engineering des Vorbilds | Hintergrund, bei Feature-Fragen |

## Arbeitsweise

1. **Meilenstein für Meilenstein.** Arbeite nur an Aufgaben des aktuellen Meilensteins in `ROADMAP.md`. Hake Checkboxen ab, wenn erledigt und getestet.
2. **Kleine Schritte.** Pro Aufgabe: kurz planen, umsetzen, Tests schreiben/ausführen, typecheck + lint, dann committen (Conventional Commits, z. B. `feat(engine): add blob generator`).
3. **Erst fragen, dann bauen**, wenn: eine Anforderung unklar ist, eine neue Dependency mit > 50 KB gzip nötig wäre, das Datenmodell geändert werden muss, oder etwas den Nicht-Zielen in `PRODUCT.md` widerspricht.
4. **Nichts erfinden.** Bei APIs von Libraries (Next.js, Supabase, Stripe, WebCodecs, Konva, Figma) die aktuelle offizielle Doku prüfen statt aus dem Gedächtnis zu arbeiten. Versionen in `package.json` sind die Wahrheit.
5. **Doku nachführen.** Wenn sich eine Entscheidung ändert, die betroffene Datei in `docs/` im selben Commit aktualisieren und unten im Entscheidungslog eintragen.

## Nicht verhandelbare Regeln

### Architektur
- **Jedes Tool ist eine `ToolDefinition`** in `packages/tool-registry` (Zod-Schema, Defaults, Presets, `randomize`, `render`, `exports`, `gating`). Keine Tool-spezifische Logik in der Editor-Shell.
- **Ein Render-Pfad**: Vorschau und Export verwenden dieselbe Render-Funktion.
- **Deterministisch**: In `packages/engine`, `packages/effects`, `packages/shaders` niemals `Math.random()`, `Date.now()` oder DOM-Zugriffe. Zufall nur über den übergebenen seeded `Rng`.
- **Rechenintensives in Web Worker** (Bildeffekte, GIF, Video, grosse Exporte). UI-Thread nie länger als 50 ms blockieren.
- **Schwere Libraries dynamisch laden** (`next/dynamic`, `import()`), z. B. Konva, gifenc, Muxer, three.js.

### Sicherheit
- **RLS auf jeder Tabelle**, Policies mit Tests.
- **SVG-Uploads immer sanitizen** (keine Scripts, Event-Handler, `foreignObject`, externen Referenzen). Nie Nutzer-SVG unsanitized per `dangerouslySetInnerHTML` rendern.
- Secrets nur in Umgebungsvariablen, nie im Client-Bundle (nur `NEXT_PUBLIC_*` ist öffentlich und darf nichts Geheimes enthalten).
- API-Keys nur gehasht speichern. Stripe-Webhooks mit Signaturprüfung und idempotent.
- Serverseitige Fetches auf Nutzer-URLs (Brand Kit aus URL) nur mit SSRF-Schutz (keine privaten IP-Ranges, Timeouts, Grössenlimit).

### Lifetime-Ökonomie
- **Keine Abo-Logik bauen** (keine Stripe Subscriptions, keine wiederkehrenden Preise). Alle Käufe sind Einmalzahlungen.
- **Jede Funktion mit laufenden Kosten pro Nutzer** (KI, API, serverseitiges Rendering, grosse Speicherung) braucht vor der Umsetzung eine Kostenschätzung und läuft über das Credit-System (`credit_ledger`) oder ein Fair-Use-Limit. Im Zweifel fragen.
- Neue Features standardmässig **clientseitig** umsetzen, damit sie keine laufenden Kosten erzeugen.
- Credit-Saldo nie direkt überschreiben, nur Ledger-Einträge anfügen.

### Code-Qualität
- TypeScript `strict`, kein `any` ohne Kommentar mit Begründung.
- Tests: jede Engine-Funktion mit Unit-Test; jedes Tool mit Snapshot-Test pro Preset (`seed = 1`); `defaults` und `presets` müssen `schema.parse` bestehen.
- Komponenten zugänglich (Tastatur, Labels, Fokus). axe-Check in E2E.
- Keine hartkodierten UI-Texte: alles über i18n-Keys (`next-intl`), DE und EN mindestens.

### Inhalte und Recht (Clean-Room)
- **Keine** Texte, Bilder, Shapes, Packs, Templates, Code oder Markenelemente von magicpattern.design oder anderen Produkten übernehmen. Nur allgemein bekannte Algorithmen umsetzen.
- Fonts nur mit OFL/Apache-Lizenz; Lizenz jeder Asset-Quelle in `assets/LICENSES.md` dokumentieren.

### Sprache und Stil
- Code, Kommentare, Commit-Messages: **Englisch**.
- Nutzertexte: DE (Schweizer Rechtschreibung, **kein Eszett, immer ss**, Du-Form), EN, später FR/IT.
- In deutschen Texten keine Gedankenstriche als Satzzeichen; Kommas, Klammern oder neue Sätze verwenden.

## Befehle (nach M0 gültig, bei Änderungen hier nachführen)

```bash
pnpm install            # Abhängigkeiten
pnpm dev                # Web-App lokal (apps/web)
pnpm build              # Alle Pakete bauen
pnpm test               # Vitest (alle Pakete)
pnpm test:e2e           # Playwright (alle Browser)
pnpm test:e2e:chromium  # Playwright nur Chromium
pnpm --filter @motivo/web cf:preview  # Build für Cloudflare + lokale Vorschau in workerd
pnpm lint && pnpm typecheck
pnpm db:migrate         # Supabase-Migrationen lokal anwenden (ab M3)
pnpm db:types           # Supabase-Typen generieren (ab M3)
```

## Neues Tool hinzufügen (Checkliste)

1. Spezifikation in `docs/TOOLS.md` lesen.
2. Generator in `packages/engine/src/tools/<tool-id>/` (rein, testbar) bzw. `packages/effects` oder `packages/shaders`.
3. `ToolDefinition` in `packages/tool-registry/src/tools/<tool-id>.ts` mit Schema, Defaults, mindestens 6 Presets, `randomize`, `gating`.
4. In der Registry registrieren.
5. i18n-Keys: Name, Kurzbeschreibung, Control-Labels, SEO-Texte (Was ist, Anleitung, 3 bis 5 FAQ).
6. Tests: Schema, Snapshots pro Preset, Export-Smoke-Test.
7. Tool im Katalog, auf Kategorie-Seite und in der Sitemap prüfen.
8. Eintrag im Changelog (`apps/web/content/changelog`).

## Definition of Done (für jede Aufgabe)

- [ ] Funktioniert in Chrome, Safari, Firefox (aktuelle Versionen)
- [ ] Light und Dark Mode geprüft
- [ ] Tastaturbedienung geprüft
- [ ] Tests geschrieben und grün; `pnpm lint && pnpm typecheck` grün
- [ ] i18n-Keys für DE und EN vorhanden
- [ ] Relevante `docs/` aktualisiert, Roadmap-Checkbox abgehakt

## Entscheidungslog

| Datum | Entscheidung | Begründung |
|---|---|---|
| 2026-10-27 | Next.js + Supabase + Stripe, Monorepo mit pnpm/Turborepo | SEO-Seiten + interaktiver Editor + Plugins teilen sich Engine-Code |
| 2026-10-27 | Client-first Rendering, schema-getriebene Tools | Tiefe Betriebskosten, 30+ Tools mit kleiner Crew wartbar |
| 2026-10-27 | Arbeitstitel "Motivo" | Vor Launch Marke/Domain prüfen |
| 2026-10-27 | Lifetime-Lizenzen statt Abos, KI/API über Credits, Preistreppe Founders/Early Bird/Regulär | Klare Differenzierung, keine Abo-Müdigkeit; laufende Kosten bleiben dank Client-Rendering und Credits gedeckt |
| 2026-10-27 | Hosting auf Cloudflare Workers via OpenNext statt Vercel | Entscheid Andreas; Preview-Deployments pro PR über Cloudflare |
| 2026-10-27 | TypeScript auf 6.0.x gepinnt (nicht 7.x) | typescript-eslint unterstützt aktuell nur TypeScript < 6.1; bei Support upgraden |
| 2026-10-27 | Deploy über GitHub Actions statt Cloudflare Workers Builds | Workers Builds konnte das Repo wiederholt nicht klonen; Actions-Deploy ist unabhängig davon und zeigt Preview-URL im PR |
| 2026-10-27 | Kein SVGO in M1 | Generatoren erzeugen bereits kompaktes SVG; SVGO wäre über 50 KB gzip. Neubeurteilung bei Nutzer-Uploads (M4) |
| 2026-10-27 | URL-Slugs zentral in `apps/web/i18n/slugs.ts`, hreflang über Metadata API, alte Pfade per 308 im Proxy | Eine Datenquelle für Proxy, Server und Client; next-intl-Link-Header kennen keine Slugs; M1-Share-Links bleiben gültig (Details `docs/ARCHITECTURE.md` Abschnitt 7) |
| 2026-10-27 | CSP ohne Nonces, mit `'unsafe-inline'` für Scripts und Styles; Header aus `lib/security-headers.ts` (next.config, proxy, `public/_headers`) | Nonces erzwingen dynamisches Rendering; Next setzt auf statischen Seiten seitenspezifische Inline-Scripts, ein Hash würde `'unsafe-inline'` abschalten. Theme-Hash liegt bereit (`lib/csp-hash.ts`) |

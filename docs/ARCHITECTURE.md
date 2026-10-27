# ARCHITECTURE.md: Technische Architektur

> Versionen von Frameworks und Libraries sind **bei Projektstart zu prüfen** (Stand Wissen: Mitte 2026). Wo eine Library als Empfehlung genannt ist, gilt: zuerst kurz die aktuelle Doku und den Wartungsstatus checken.

## 1. Leitprinzipien

1. **Ein Render-Pfad**: Vorschau und Export nutzen exakt denselben Code. (MagicPattern hatte laut Changelog Bugs, weil Vorschau und Export auseinanderliefen.)
2. **Deterministisch**: Jedes Ergebnis ist vollständig beschrieben durch `{ toolId, version, params, seed }`. Gleiche Eingabe ergibt immer dasselbe Bild. Das ermöglicht Speichern als kleines JSON, Share-Links, API und Undo.
3. **Client-first Rendering**: Rechenarbeit läuft im Browser (SVG, Canvas 2D, WebGL2, Web Worker). Server nur für Auth, Persistenz, Billing, Community, API und KI.
4. **Schema-getriebene Tools**: Ein Tool ist eine Datei mit Parameter-Schema und Render-Funktion. Die UI baut sich daraus automatisch. Nur so skaliert eine kleine Crew auf 30+ Tools.
5. **Isomorphe Engine**: Die Generatoren sind reines TypeScript ohne DOM-Abhängigkeit (wo möglich), damit sie im Browser, im Worker, auf dem Server (API) und in Plugins laufen.

## 2. Stack-Empfehlung

| Schicht | Wahl | Begründung |
|---|---|---|
| Monorepo | **pnpm + Turborepo** | Engine, Web-App und Plugins teilen Code |
| Web-App | **Next.js (App Router) + TypeScript (strict)** | SEO-Seiten statisch/ISR, Editor als Client-Komponenten |
| UI | **Tailwind CSS + shadcn/ui (Radix)** | Zugängliche Primitives, schnell anpassbar |
| Editor-State | **Zustand** (Vanilla-Store pro Editor, ohne `immer` und ohne Middleware); eigene Undo/Redo-History mit Snapshots (Params, Seed, Grösse; max. 100 Schritte, aufeinanderfolgende Änderungen desselben Parameters innerhalb 500 ms zusammengefasst) und Varianten-Filmstreifen (max. 24) im selben Store | Leichtgewichtig, gut testbar, keine Zusatz-Dependency |
| Validierung | **Zod** | Ein Schema für UI, Speicherung, API und KI-Output |
| Farben | **culori** | OKLCH, Kontraste, Interpolation |
| Vektor | eigene SVG-String-Builder mit fester Nachkommastellen-Präzision; kein SVGO (Entscheid 2026-10-27, Neubeurteilung bei Nutzer-Uploads in M4) | Schnell, serverfähig, kein grosses Bundle |
| Raster/Effekte | Canvas 2D in **OffscreenCanvas + Web Worker** | UI bleibt flüssig |
| Shader | **WebGL2** (dünner eigener Wrapper oder `twgl.js`), optional **three.js** für 3D-Grid | Volle Kontrolle über Fragment-Shader |
| GIF | **gifenc** (im Worker) | Klein, schnell |
| Video | **WebCodecs** + Muxer (**Mediabunny**, Nachfolger von mp4-muxer/webm-muxer; prüfen), Fallback `MediaRecorder` für WebM | Clientseitiger MP4/WebM-Export |
| Social-Editor/Composer | **Konva** (`react-konva`) | Ebenen, Transformationen, Text, Export |
| Backend/DB | **Supabase** (Postgres, Auth, Storage, RLS, Edge Functions), Region EU (Zürich-Region prüfen, sonst Frankfurt) | Schnell, RLS-Sicherheit, EU-Datenhaltung |
| Payments | **Stripe** (Checkout als Einmalzahlung, Tax, Rechnungen; TWINT, Karten, Apple/Google Pay in Checkout aktivieren, Verfügbarkeit pro Methode prüfen) | Standard, CH-tauglich; Einmalzahlungen sind einfacher als Abos |
| Hosting | **Cloudflare Workers** via OpenNext (`@opennextjs/cloudflare`) | Entscheid 2026-10-27, siehe Entscheidungslog in `CLAUDE.md` |
| Server-Rasterisierung (API) | **@resvg/resvg-js** (Node) bzw. `resvg-wasm` (Edge) | SVG zu PNG ohne Headless-Browser |
| KI | LLM via API mit **strukturiertem Output** (JSON gegen Zod-Schema) | KI erzeugt Parameter, keine Pixel |
| i18n | **next-intl** | DE/FR/IT/EN, lokalisierte Slugs für SEO |
| Analytics | **Plausible** oder **Umami** (cookiefrei) + PostHog (optional, EU) für Produkt-Events | nDSG-freundlich |
| Fehler | **Sentry** (EU-Region) | |
| Tests | **Vitest** (Engine, Snapshot-Tests), **Playwright** (E2E + visuelle Regression) | Deterministik ermöglicht Bild-Snapshots |

## 3. Monorepo-Struktur

```
motivo/
├─ apps/
│  ├─ web/                 # Next.js: Marketing, SEO-Seiten, Editor, Dashboard, API-Routen
│  ├─ figma-plugin/        # Phase P2
│  └─ framer-plugin/       # Phase P2
├─ packages/
│  ├─ engine/              # Reine Generatoren pro Tool (kein DOM), PRNG, Geometrie, Farbe
│  ├─ effects/             # Pixel-Effekte (Halftone, Dither, Grain ...) auf ImageData
│  ├─ shaders/             # GLSL-Quellen + Uniform-Schemas
│  ├─ exporters/           # SVG/CSS/PNG/JPG/WebP/GIF/MP4/React-Exporter
│  ├─ tool-registry/       # Tool-Definitionen (Schema, Defaults, Presets, Meta, SEO-Texte-Keys)
│  ├─ editor-ui/           # Editor-Shell, Auto-Controls aus Zod-Schema
│  ├─ ui/                  # Design-System (shadcn-basiert, Tokens)
│  ├─ db/                  # Supabase-Typen, Queries, Migrationen
│  └─ config/              # tsconfig, eslint, tailwind preset
└─ docs/                   # diese Planungsdokumente
```

## 4. Das Herzstück: Tool-Definition

Jedes Tool implementiert ein gemeinsames Interface. Damit sind Editor, Speicherung, API, KI und SEO-Seite automatisch vorhanden.

```ts
// packages/tool-registry/src/types.ts
import { z } from "zod";

export type RenderKind = "svg" | "canvas2d" | "webgl" | "image-effect" | "css" | "text";
export type ExportFormat = "svg" | "css" | "png" | "jpg" | "webp" | "gif" | "mp4" | "webm" | "react" | "json" | "tailwind";

export interface ToolDefinition<S extends z.ZodTypeAny> {
  id: string;                 // "geometric-patterns"
  version: number;            // Erhöhen bei Breaking Changes am Algorithmus
  category: ToolCategory[];   // ["patterns", "backgrounds"]
  renderKind: RenderKind;
  schema: S;                  // Zod-Schema aller Parameter
  defaults: z.infer<S>;
  presets: Preset<z.infer<S>>[];
  controls?: ControlHints<z.infer<S>>; // Gruppierung, Slider-Steps, Labels-Keys, Sichtbarkeitsregeln
  randomize: (rng: Rng, current: z.infer<S>, locks: Set<keyof z.infer<S>>) => z.infer<S>;
  render: Renderer<z.infer<S>>;       // siehe unten
  exports: ExportFormat[];
  gating: Gating<z.infer<S>>;          // welche Params/Exporte/Grössen sind Pro
  needsImageInput?: boolean;           // Halftone, Dither ...
  supportsAnimation?: boolean;         // GIF/Video
}

// Renderer je nach Art:
//  svg:      (params, seed, size) => string            // reiner SVG-String, serverfähig
//  css:      (params) => { css: string; previewSvg?: string }
//  canvas2d: (ctx: OffscreenCanvasRenderingContext2D, params, seed, size, t?) => void
//  webgl:    { fragment: string; uniforms: (params, t) => Uniforms }
//  image-effect: (input: ImageData, params, seed) => ImageData   // im Worker
```

**Konsequenzen**
- Die Editor-UI liest `schema` + `controls` und erzeugt Slider, Color-Picker, Selects, Toggles, Palette-Editor, Upload-Felder.
- `randomize` respektiert **Locks** (Schloss-Icon pro Parameter), wie beim Palette-Generator des Vorbilds.
- `version` sorgt dafür, dass gespeicherte Designs auch nach Algorithmus-Änderungen identisch aussehen (alte Versionen bleiben im Code, oder Migration der Params).

### 4.1 Zufall
- Seeded PRNG (`mulberry32` oder `sfc32`), Seed als 32-bit Integer im Design gespeichert.
- **Nie** `Math.random()` in Engine-Code (Lint-Regel).
- Leertaste = neuer Seed (und optional neue Params via `randomize`).

## 5. Render- und Export-Pipeline

```
Params + Seed ──► Renderer ──► Vorschau (DOM-SVG / Canvas / WebGL im Viewport)
                      │
                      └──► Exporter(format, size, options)
                              ├─ SVG: String (bereits kompakt) ► Datei
                              ├─ CSS: data-URI (url-encoded SVG) oder native CSS-Gradients
                              ├─ PNG/JPG/WebP: SVG ► Image ► Canvas ► Blob  |  Canvas/WebGL direkt
                              ├─ GIF: N Frames (Seed-Varianten oder Zeit t) ► gifenc (Worker)
                              ├─ MP4/WebM: Frames ► VideoEncoder (WebCodecs) ► Muxer
                              └─ React/Web-Component: Template mit eingebettetem SVG/Shader
```

Wichtige Regeln:
- **Grosse Exporte** (4K/8K) in OffscreenCanvas im Worker, mit Fortschrittsanzeige und Abbruch.
- **Max. Canvasgrösse** pro Browser beachten (Safari-Limits), bei Überschreitung kacheln.
- **Wasserzeichen** wird im Exporter angewendet, nie in der Vorschau versteckt "eingebrannt".
- Jeder Export erzeugt ein `export_event` (Tool, Format, Grösse, Lizenzstufe) für Refund-Regel, Limits und Analytics.
- **Clipboard**: `navigator.clipboard.write` mit PNG-Blob; Fallback Download.

## 6. Datenmodell (Postgres / Supabase)

```sql
profiles        (id uuid pk = auth.users.id, display_name, locale, created_at)
tiers           (id text pk, name, limits jsonb)               -- free, solo, pro, team
licenses        (id, owner_id, tier_id, seats int default 1, status enum('active','refunded','revoked'),
                 source enum('stripe','ltd_platform','gift','manual'), price_paid_cents, currency,
                 price_phase text,                              -- founders, early_bird, regular
                 provider_payment_id, purchased_at, refunded_at null)
license_seats   (license_id, user_id, assigned_at)              -- Team-Lizenzen
purchases       (id, user_id, kind enum('license','upgrade','credit_pack'), stripe_checkout_id unique,
                 amount_cents, currency, created_at)            -- Beleg jeder Zahlung, idempotent
credit_ledger   (id, user_id, delta int, reason enum('pack','ai_use','api_use','refund','adjust'),
                 ref text null, created_at)                     -- gekaufte Credits; Saldo = SUM(delta), nie überschreiben
credit_usage_monthly (user_id, month date, used int, pk(user_id, month))   -- Inklusiv-Credits pro Monat
price_phases    (id text pk, tier_id, currency, amount_cents, max_units int null, sold_units int, active bool)
entitlements    -- View oder Funktion: höchste aktive Lizenz (eigene oder Team-Sitz) + tiers.limits

folders         (id, owner_id, name, parent_id null, created_at)
designs         (id, owner_id, folder_id null, tool_id, tool_version, params jsonb, seed int,
                 width int, height int, title, thumbnail_path, is_public bool default false,
                 remix_of uuid null, created_at, updated_at)
compositions    (id, owner_id, title, layers jsonb, width, height, ...)   -- Composer, P2

brand_kits      (id, owner_id, name, is_default)
brand_palettes  (id, brand_kit_id, name, colors text[])          -- max 10 Farben
brand_assets    (id, brand_kit_id, kind enum('logo','shape','image','font'), storage_path, meta jsonb)

shape_packs     (id, owner_id null, name, slug, is_public, is_official, license)
shapes          (id, pack_id, svg text, viewbox, tags text[])

templates       (id, owner_id null, kind enum('social','composition'), data jsonb, size_key, is_public)
community_likes (user_id, item_type, item_id, created_at, pk(user_id,item_type,item_id))

export_events   (id, user_id null, anon_id null, tool_id, format, width, height, tier_at_export, created_at)
api_keys        (id, user_id, name, key_hash, last4, scopes text[], created_at, revoked_at)
api_usage       (api_key_id, day date, count int, pk(api_key_id, day))
ai_requests     (id, user_id, tool_id, prompt, result_params jsonb, tokens_in, tokens_out, created_at)
```

**Sicherheit**
- **RLS auf allen Tabellen**: Besitzer liest/schreibt eigene Zeilen; `is_public = true` ist für alle lesbar.
- API-Keys nur gehasht speichern (SHA-256 + Pepper), Klartext nur einmal anzeigen.
- Uploads: SVG serverseitig **sanitizen** (DOMPurify im SVG-Profil oder eigener Whitelist-Parser: keine `script`, `foreignObject`, Event-Handler, externen Referenzen). Bilder auf Grösse/Typ prüfen.
- Stripe-Webhooks mit Signaturprüfung, idempotent verarbeiten (Unique-Key auf `stripe_checkout_id`).

**Lifetime-Kauf und Credits (Ablauf)**
- Stripe Checkout im Modus **Einmalzahlung** (`mode=payment`), mit Rechnungserstellung für Firmenkunden. Kein Abo, kein Customer Portal nötig; Belege und Rechnungen im eigenen Bereich `/app/license` anzeigen.
- Webhook `checkout.session.completed` ► `purchases` schreiben ► `licenses` anlegen bzw. Upgrade umsetzen ► bei Phasenpreis `price_phases.sold_units` atomar erhöhen (Transaktion, damit Founders-Kontingent nie überverkauft wird).
- Refund (`charge.refunded`) ► Lizenz auf `refunded`, Entitlements fallen auf Free zurück, gespeicherte Designs bleiben lesbar.
- **Zwei Credit-Töpfe**: Inklusiv-Credits als einfacher Monatszähler (`credit_usage_monthly (user_id, month, used)`, Limit aus `tiers.limits`, verfällt automatisch mit dem Monatswechsel, kein Cron nötig). Gekaufte Credits im `credit_ledger` (verfallen nie). Verbrauch zuerst aus dem Inklusiv-Topf, danach aus dem Ledger.
- Credit-Abbuchung **vor** dem teuren Aufruf reservieren, bei Fehler zurückbuchen.
- Rate Limits auf API, KI und Uploads (z. B. Upstash Redis oder Postgres-basiert).

## 7. Routing und SEO

```
/[locale]                               Startseite
/[locale]/tools                         Katalog (Kategorie-Filter)
/de/tools/kategorie/[cat], /en/tools/category/[cat]   Kategorie-Seiten
/[locale]/[tool-slug]                   SEO-Landingpage (statisch generiert)
/[locale]/tools/[tool-slug]             Editor (Client), ?d=<designId> oder ?p=<base64-params>
/de/konverter, /en/convert              Konverter-Übersicht
/de/konverter/[slug], /en/convert/[slug]   Konverter (z. B. /de/konverter/svg-zu-css)
/[locale]/community/...                 Packs, Paletten, Templates (ISR)
/[locale]/gradients, /palettes, /wallpapers   Programmatic-SEO-Sammlungen
/[locale]/blog, /changelog, /pricing
/app/dashboard, /app/brand, /app/settings, /app/license   (nicht indexiert; Lizenz, Belege, Credits)
/api/v1/...                             Öffentliche API
```

- Lokalisierte Slugs (z. B. `/de/geometrische-muster-generator`), `hreflang`, Sitemap pro Sprache.

**Slug-Modell (seit M2-AP07)**
- **Sprachen**: `apps/web/i18n/locales.ts` kennt `ALL_LOCALES` (de, en, fr, it) und `ENABLED_LOCALES` (de, en). Nur aktivierte Sprachen werden geroutet, haben Messages und erscheinen in `hreflang`. FR/IT aktivieren heisst: in `ENABLED_LOCALES` aufnehmen, `messages/<locale>.json` anlegen, Slugs ergänzen.
- **Einzige Quelle** für URL-Slugs ist `apps/web/i18n/slugs.ts`: `TOOL_SLUGS` (Tool-ID ► Slug pro Sprache), `CONVERTER_SLUGS` und `SECTION_SLUGS` (erstes Pfadsegment, z. B. `convert` ► `konverter`). Reine Daten ohne Registry- oder Message-Import, darum in Proxy, Server-Seiten und Client nutzbar. Ein neues Tool braucht nur einen Eintrag; der Vertragstest `slugs.test.ts` verlangt für jedes registrierte Tool und jeden Konverter einen gültigen, pro Sprache eindeutigen Slug in jeder aktivierten Sprache. Vorbereitete Sprachen ohne eigenen Slug fallen auf EN zurück. Ein Slug bleibt nach Veröffentlichung stabil.
- Derselbe Tool-Slug gilt für Editor (`/[locale]/tools/[slug]`) und die künftige Landingpage (`/[locale]/[slug]`); Tool-Slugs dürfen darum keine reservierten Segmente sein (im Test geprüft).
- **Routing**: next-intl `pathnames` in `i18n/routing.ts` lokalisiert die statischen Segmente; interne Ordner heissen `tools/[toolSlug]` und `convert/[converterSlug]`. Die Seiten lösen den Slug der aktuellen Sprache auf und liefern sonst 404.
- **Seitenmodell**: `i18n/paths.ts` beschreibt Seiten sprachunabhängig (`AppRoute`) und liefert `routeHref` (für `Link`), `routePath`, `localizedPaths`, `toolEditorPaths`, `toolSlugs` sowie `routeFromPathname` (Sprachumschalter). Sitemap, Katalog und Landingpages bauen darauf auf.
- **Alte Pfade**: `proxy.ts` leitet Tool-IDs (M1-Links wie `/en/tools/blob#d=…`), Slugs oder Segmente einer anderen Sprache mit einem 308 auf die kanonische URL um (`i18n/legacy.ts`). Der Hash `#d=` bleibt dabei im Browser erhalten.
- **`hreflang` und Canonical** über die Metadata API (`lib/seo/alternates.ts`): Canonical, alle aktivierten Sprachen und `x-default`. `x-default` zeigt seit M2-AP08 überall (auch auf der Startseite) auf die englische Seite, weil Englisch die internationale Rückfallsprache ist; die Routing-Standardsprache für die Spracherkennung bleibt DE. Die Link-Header der next-intl-Middleware sind aus (`alternateLinks: false`), weil sie die Slugs nicht kennen.
- **Basis-URL** aus `NEXT_PUBLIC_SITE_URL` (wird beim Build eingesetzt), Fallback `https://motivo-web.andreas-65d.workers.dev`, bis die Domain feststeht.
- **Sprachumschalter** bleibt auf der gleichen Seite und übersetzt Abschnitt und Slug (z. B. `/de/konverter/svg-zu-css` ► `/en/convert/svg-to-css`).

**SEO-Seiten (seit M2-AP08)**
- **Alles aus Registry und Slug-Maps**: Landingpages, Katalog, Kategorie-Seiten, verwandte Tools und Sitemap entstehen aus `registry.list()`, `TOOL_CATEGORIES`, `CONVERTER_IDS` und `i18n/slugs.ts`. Ein neues Tool braucht keine Änderung an diesen Seiten; die Vertragstests (`i18n/slugs.test.ts`, `lib/seo/content.test.ts`) verlangen Slug, Texte (`tools.<id>.name`, `description`, `seo.whatIs`, `seo.howTo`) und 3 bis 5 FAQ in DE und EN. Platzhalter (`seo.todo`) lassen den Test scheitern.
- **Landingpage** `/[locale]/[toolSlug]` (`app/[locale]/[toolSlug]/page.tsx`, statisch, `dynamicParams = false`): H1, Kurztext, CTA zum Editor, Vorschau des Defaults (Seed 1), 4 Preset-Kacheln, die den Editor mit dem Preset öffnen (Share-Hash `#d=…`, kein neuer Editor-Mechanismus), "Worum geht’s?", "So geht’s", FAQ, Kategorie-Chips und bis zu 6 verwandte Tools (gleiche Primärkategorie zuerst, `lib/catalogue.ts`). Kein Client-JS ausser dem gemeinsamen Layout.
- **Katalog** `/[locale]/tools`: alle Tools einmal, gruppiert nach Primärkategorie (erste Kategorie im Tool), Sprunglinks pro Kategorie, Konverter als eigene Gruppe. Karten verlinken auf die Landingpage, ein zweiter Link öffnet direkt den Editor.
- **Kategorie-Seiten** `/de/tools/kategorie/<slug>`, `/en/tools/category/<slug>`: `CATEGORY_SLUGS` und `CATEGORY_SEGMENT` in `i18n/slugs.ts` (Vertragstest: jede `ToolCategory` hat einen eindeutigen Slug). Seiten entstehen nur für Kategorien mit mindestens einem Tool und listen jedes Tool, das die Kategorie irgendwo führt. Fremdsprachige Slugs und Segmente (auch bei Landingpages, z. B. `/de/polka-dot-pattern-generator`) leitet `i18n/legacy.ts` mit 308 um.
- **Motive als Dateien**: Vorschauen und Thumbnails sind vorgerenderte SVG-Dateien `/motifs/<toolId>/<default|presetId>.svg` (Route Handler, statisch, für alle Sprachen gleich), eingebunden per `<img>` mit Grösse und `loading="lazy"`. Inline-Data-URLs hätten das HTML stark aufgebläht (einzelne Motive über 100 KB).
- **Strukturierte Daten** (JSON-LD, `lib/seo/json-ld.ts`): `WebApplication` mit Gratis-Angebot (Preis 0, ohne Bewertungen), `FAQPage` und `BreadcrumbList` auf Landingpages, Konverter-Seiten (dort ebenfalls) sowie `BreadcrumbList` auf Katalog und Kategorien. `serializeJsonLd` maskiert `<`, `>`, `&`, U+2028/2029, darum kann kein Text das Script-Element schliessen.
- **OG-Bilder** statisch statt pro Request: `scripts/og-images.mjs` rendert vor `next build` und `next dev` mit `next/og` in Node pro Tool und Sprache ein PNG (1200 × 630, Default-Motiv plus Tool-Name) nach `public/og/<locale>/<toolId>.png` (nicht eingecheckt). Die Workspace-Quellen laufen dabei über das Type-Stripping von Node (ab 22.18) plus einen kleinen Resolve-Hook (`scripts/ts-resolve-hook.mjs`), ohne neue Dependency. Grund: `next/og` im Worker hätte das Bundle um rund 1,1 MiB gzip vergrössert (resvg.wasm, Font, Satori; gemessen 2609 statt 1521 KiB gzip), für Bilder, die sich zur Laufzeit nie ändern. Mit der statischen Lösung wächst der Worker durch AP08 von 1521 auf 1789 KiB gzip (neue Seiten und Routen).
- **Ausspielung auf Cloudflare**: `open-next.config.ts` nutzt den Static-Assets-Incremental-Cache mit Cache Interception. Vorgerenderte Seiten, Motive, Sitemap und Robots kommen ohne Rendering aus den Workers Static Assets (`x-opennext-cache: HIT`), OG-Bilder sind gewöhnliche Assets. Revalidierung (ISR) ist damit nicht möglich; sobald ISR-Seiten kommen, auf den R2-Cache wechseln.
- **Sitemap und Robots**: `app/sitemap.ts` (statisch) listet Startseite, Katalog, Kategorien, Landingpages, Konverter-Übersicht und Konverter in jeder Sprache, jeweils mit denselben `hreflang`-Alternativen wie die Seite (`lib/seo/sitemap.ts`). Editor-Seiten bleiben indexierbar, stehen aber nicht in der Sitemap, weil die Landingpages den Text tragen. `app/robots.ts` erlaubt alles und verweist auf die Sitemap.
- **Keine Indexierung ausserhalb der Produktion**: `next.config.ts` setzt per `headers()`-Regel mit `missing: host` auf jedem Host ausser dem Produktions-Host (Host von `NEXT_PUBLIC_SITE_URL`, sonst der workers.dev-Fallback) `X-Robots-Tag: noindex, nofollow` (`lib/seo/indexing.ts`). Das trifft Worker-Previews (`<alias>-motivo-web.<subdomain>.workers.dev`), lokale Server und später die workers.dev-URL, sobald eine eigene Domain kanonisch ist, ohne Build-Flag pro Umgebung. Die Regel greift auch für vorgerenderte Seiten, Sitemap und Robots (mit OpenNext in workerd geprüft). Bewusst kein `Disallow` in `robots.txt`, sonst sähen Crawler den Header nicht. Tests: `lib/seo/indexing.test.ts`, `e2e/seo.spec.ts`.
- Share-Links: Params im URL-Hash komprimiert (z. B. `lz-string`), damit ein Design ohne Account teilbar ist.

## 8. Öffentliche API (P2)

```
POST /api/v1/render/{toolId}
Authorization: Bearer <api_key>
Body: { "params": {...}, "seed": 123, "width": 1200, "height": 630, "format": "svg|png|jpg|css" }
→ 200: Datei bzw. { "css": "..." }
GET  /api/v1/tools                → Liste der Tools inkl. JSON-Schema (aus Zod generiert)
GET  /api/v1/tools/{toolId}/schema
```

- Nur Tools mit `renderKind` `svg` oder `css` serverseitig (WebGL/Effekte nicht im ersten Schritt).
- JSON-Schema via `zod-to-json-schema` (oder native Zod-Funktion, je nach Version) generieren: dieselbe Quelle wie Editor und KI.
- Caching: Hash aus `{toolId, version, params, seed, size, format}` als ETag/CDN-Key.
- Zugang nur mit Lifetime Pro; Abrechnung pro Render über Credits (Cache-Treffer kostenlos), damit die API die Lifetime-Ökonomie nicht belastet.

## 9. KI-Funktionen (P2)

1. **Describe it**: Prompt + Tool-ID ► LLM mit strukturiertem Output gegen das Tool-Schema ► Validierung mit Zod ► Params im Editor anwenden. Nie freien Code ausführen.
2. **Brand Kit aus URL**: Server lädt Seite (mit Timeouts, Grössenlimit, SSRF-Schutz: keine privaten IP-Ranges), extrahiert Farben aus CSS/Logo, Fonts aus `@font-face`/Google-Fonts-Links, schlägt Palette vor.
3. **Palette aus Stimmung**: "Herbst am Zürichsee" ► 5 Farben (OKLCH), danach Kontrastprüfung.
- Abrechnung über `credit_ledger` (monatliches Inklusivkontingent je Lizenzstufe + gekaufte Packs), Logging in `ai_requests`, Prompts nicht für Training weitergeben (Anbieterbedingungen prüfen).
- Credit-Preis pro Aktion so festlegen, dass Modellkosten inklusive Puffer gedeckt sind; Modellkosten monatlich überwachen und Preis bei Bedarf anpassen.

## 10. Plugins (P2)

- **Figma-Plugin**: Plugin-UI ist ein iframe, das eine abgespeckte Editor-Route lädt (`/embed/tools/[tool]`). Ergebnis per `postMessage` an den Plugin-Code, dort `figma.createNodeFromSvg()` (Vektor) bzw. `figma.createImage()` (Raster). Auth über Device-Code oder API-Key.
- **Framer-Plugin**: analog, Framer Plugin API; Login via API-Key (wie beim Vorbild).
- Gemeinsames `embed`-Layout ohne Navigation, mit Message-Bridge-Package.

## 11. Performance-Budget

- Tool-Seite: JS für Erstaufruf < 200 KB gzip; WebGL/Konva/gifenc nur dynamisch laden.
- Vektor-Vorschau neu rendern < 16 ms bei typischen Params; sonst Debounce + Worker.
- Bildeffekte immer im Worker; Vorschau auf herunterskaliertem Bild, Export in voller Grösse.
- Thumbnails beim Speichern clientseitig als WebP (400 px) erzeugen und in Supabase Storage ablegen.

## 12. Qualitätssicherung

- **Engine-Snapshot-Tests**: Für jedes Tool und jedes Preset `render(defaults, seed=1)` ► SVG-Snapshot bzw. Pixel-Hash.
- **Visuelle Regression** mit Playwright (Chromium, WebKit, Firefox) für Vorschau == Export.
- **Schema-Tests**: `defaults` und alle `presets` müssen `schema.parse` bestehen.
- **Barrierefreiheit**: axe-Checks in CI, alle Controls per Tastatur bedienbar.
- **Sicherheit**: SVG-Sanitizer mit bekannten XSS-Payloads testen; RLS-Policies mit Tests (pgTAP oder Supabase-Testhelper).

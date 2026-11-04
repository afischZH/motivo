# WALLPAPERS.md: Hintergrundbild-App

Schwesterprojekt von Musterli: ein Generator für Hintergrundbilder, der vom Gerät ausgeht (Handy, Tablet, Laptop, Monitor, Ultrawide, später mehrere Monitore). Gratis, spendenfinanziert, alles im Browser, gleiche Regeln wie Musterli (`CLAUDE.md`).

Plan (Englisch, Claude Doc): https://claude.ai/artifact/BmCKevGSUyPGJgS8bgcTcM

## Entscheide

| Datum | Entscheid |
|---|---|
| 2026-11-04 | Eigene App `apps/wallpapers` im Musterli-Monorepo (Option B), teilt die Pakete mit `apps/web` |
| 2026-11-04 | Start ohne Namen und Domain auf `wallpapers-web.<subdomain>.workers.dev`; bis zum Launch `X-Robots-Tag: noindex` auf allen Seiten |
| 2026-11-04 | EN als Standardsprache (die meisten Suchen nach Wallpapers sind englisch), DE als zweite Sprache |

## Aufbau

- `apps/wallpapers`: Next.js-App (App Router, next-intl, Tailwind), eigener Worker `wallpapers-web`, Deploy über `.github/workflows/deploy-wallpapers.yml` (nur bei Änderungen an der App, an `packages/devices`, `packages/config` oder am Lockfile).
- `packages/devices`: Gerätekatalog (native Pixel in natürlicher Ausrichtung, Gruppen, Safe Zones als Anteile der Leinwand) und `detectScreen` (erkennt das Gerät aus Bildschirmgrösse und Pixelverhältnis). Ids sind stabil, nie umbenennen. Auflösungen jeden Herbst mit den Herstellerangaben abgleichen.
- Editor (`components/wallpaper-editor.tsx`, nur im Browser geladen): 8 SVG-Generatoren aus `@musterli/tool-registry` (`lib/generators.ts`), Vorschau und Export über denselben Render-Pfad (`renderDesignSvg`, `exportRaster` aus `@musterli/exporters`). Der Generator rendert in CSS-Pixeln (native Grösse geteilt durch den grössten ganzzahligen Teiler bis zum Pixelverhältnis, `lib/target.ts`), der Export skaliert auf die native Grösse; so sind Linien so dick wie auf dem Bildschirm. Teilen-Link `#d=<Musterli-Code>&t=<Geräte-Id oder BxH>` (`lib/share.ts`).
- Tool- und Look-Namen stehen kopiert in `messages/*.json` unter `Tools` (ein Test prüft, dass jeder Look benannt ist).
- Sicherheits-Header in `apps/wallpapers/lib/security-headers.ts`, identisch in `public/_headers` (Test prüft das). Keine fremden Origins.
- Hell und dunkel folgen vorerst der Systemeinstellung; ein Umschalter kommt mit dem Editor.

## Etappen

| Etappe | Inhalt | Stand |
|---|---|---|
| T0 | Setup: App, Worker, Deploy, Gerätekatalog mit Tests | erledigt (PR #36) |
| T1 | Editor ab Gerät: Geräteerkennung und -wahl, Safe-Zone-Overlay, Leertaste, Export in nativer Grösse, Teilen-Link, 8 Generatoren aus Musterli | in Arbeit (Fokuspunkt und Shader-Verlauf folgen in T2) |
| T2 | Sets und SEO (öffentliche Beta): Hell/Dunkel-Paare, ZIP für alle Geräte, Brand Kit, Geräte- und Stilseiten | offen |
| T3 | Mehrere Monitore und neue Generatoren (Launch) | offen |
| T4 | Info-Wallpapers (Kalender, Jahresfortschritt, Zitate), PWA | offen |
| T5 | Live-Wallpapers (nach Musterli S3, Video) | offen |

Offen bei Andreas: Name und Domain, Finanzierung (Vorschlag wie Musterli), Zeitpunkt Live-Wallpapers, eigene Marke oder "Musterli Wallpapers".

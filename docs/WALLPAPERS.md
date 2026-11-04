# WALLPAPERS.md: Hintergrundbild-App

Schwesterprojekt von Musterli: ein Generator für Hintergrundbilder, der vom Gerät ausgeht (Handy, Tablet, Laptop, Monitor, Ultrawide, später mehrere Monitore). Gratis, spendenfinanziert, alles im Browser, gleiche Regeln wie Musterli (`CLAUDE.md`).

Plan (Englisch, Claude Doc): https://claude.ai/artifact/BmCKevGSUyPGJgS8bgcTcM

## Entscheide

| Datum | Entscheid |
|---|---|
| 2026-11-04 | Eigene App `apps/wallpapers` im Musterli-Monorepo (Option B), teilt die Pakete mit `apps/web` |
| 2026-11-04 | Start ohne Namen und Domain auf `wallpapers-web.<subdomain>.workers.dev`; bis zum Launch `X-Robots-Tag: noindex` auf allen Seiten |
| 2026-11-04 | EN als Standardsprache (die meisten Suchen nach Wallpapers sind englisch), DE als zweite Sprache |
| 2026-11-04 | T2: Feinschliff (Körnung, Abdunkeln, ruhige Fläche hinter der Uhr) als eigene SVG-Ebenen um das Generator-SVG, je als `<image>` mit data-URI (Ids bleiben getrennt); Körnung aus dem Musterli-Tool Körnung (Basis "Keine", Overlay-Mischung). Dunkle Version eines Paars = gleiches Bild, 45 Prozentpunkte stärker abgedunkelt (höchstens 80) |
| 2026-11-04 | T2: Shader-Verlauf noch nicht als Stil. Er braucht einen zweiten, asynchronen Render-Pfad (Shader-Worker über `@musterli/editor-ui/render-image`) für Vorschau, Paare und Sets; folgt in T3 zusammen mit den neuen Generatoren |

## Aufbau

- `apps/wallpapers`: Next.js-App (App Router, next-intl, Tailwind), eigener Worker `wallpapers-web`, Deploy über `.github/workflows/deploy-wallpapers.yml` (nur bei Änderungen an der App, an `packages/devices`, `packages/config` oder am Lockfile).
- `packages/devices`: Gerätekatalog (native Pixel in natürlicher Ausrichtung, Gruppen, Safe Zones als Anteile der Leinwand) und `detectScreen` (erkennt das Gerät aus Bildschirmgrösse und Pixelverhältnis). Ids sind stabil, nie umbenennen. Auflösungen jeden Herbst mit den Herstellerangaben abgleichen.
- Editor (`components/wallpaper-editor.tsx`, nur im Browser geladen): 18 SVG-Generatoren in zwei Gruppen «Weich» und «Grafisch» (Wunsch Andreas 2026-11-04: Bauhaus, Geometrisch, Neon, Glitch, Retro-Gitter, Streifen, Guilloche, Terrazzo, Punktringe, Sternenhimmel kamen in T2 dazu) aus `@musterli/tool-registry` (`lib/generators.ts`), Vorschau und Export über denselben Render-Pfad (`renderDesignSvg`, `exportRaster` aus `@musterli/exporters`). Der Generator rendert in CSS-Pixeln (native Grösse geteilt durch den grössten ganzzahligen Teiler bis zum Pixelverhältnis, `lib/target.ts`), der Export skaliert auf die native Grösse; so sind Linien so dick wie auf dem Bildschirm. Teilen-Link `#d=<Musterli-Code>&t=<Geräte-Id oder BxH>&f=<Körnung>.<Abdunkeln>.<Uhr 0|1>` (`lib/share.ts`, `f` fehlt ohne Feinschliff, T1-Links bleiben gültig).
- Ein Render-Pfad für alles: `lib/render.ts` (`wallpaperSvg` = Generator plus Feinschliff aus `lib/finish.ts`). Einzelbild, Hell/Dunkel-Paar und Gruppen-Set rendern darüber; Sets (`lib/sets.ts`, `lib/download.ts`) rechnen die Bilder nacheinander (immer nur ein grosses Bitmap im Speicher) und packen sie mit dem ZIP-Writer aus `@musterli/exporters` (PNG ungepackt gespeichert).
- Geräteseiten `/<locale>/devices/<Geräte-Id>` (statisch, `lib/device-pages.ts`), Editor startet auf dem Gerät (ein Teilen-Link gewinnt), `app/sitemap.ts` mit hreflang. Basis-URL aus `NEXT_PUBLIC_SITE_URL`, sonst die workers.dev-Adresse.
- Tool- und Look-Namen stehen kopiert in `messages/*.json` unter `Tools` (ein Test prüft, dass jeder Look benannt ist).
- Sicherheits-Header in `apps/wallpapers/lib/security-headers.ts`, identisch in `public/_headers` (Test prüft das). Keine fremden Origins.
- Hell und dunkel folgen vorerst der Systemeinstellung; ein Umschalter kommt mit dem Editor.

## Etappen

| Etappe | Inhalt | Stand |
|---|---|---|
| T0 | Setup: App, Worker, Deploy, Gerätekatalog mit Tests | erledigt (PR #36) |
| T1 | Editor ab Gerät: Geräteerkennung und -wahl, Safe-Zone-Overlay, Leertaste, Export in nativer Grösse, Teilen-Link, 8 Generatoren aus Musterli | erledigt (PR #37) |
| T2 | Sets und SEO: Feinschliff (Körnung, Abdunkeln, ruhige Uhr-Fläche), Hell/Dunkel-Paar als ZIP, ZIP mit allen Grössen einer Gerätegruppe, Geräteseiten und Sitemap, 10 weitere grafische Stile | in Arbeit. Verschoben nach T3: Shader-Verlauf, Fokuspunkt, Stilseiten, Brand Kit |
| T3 | Mehrere Monitore und neue Generatoren (Launch) | offen |
| T4 | Info-Wallpapers (Kalender, Jahresfortschritt, Zitate), PWA | offen |
| T5 | Live-Wallpapers (nach Musterli S3, Video) | offen |

Offen bei Andreas: Name und Domain, Finanzierung (Vorschlag wie Musterli), Zeitpunkt Live-Wallpapers, eigene Marke oder "Musterli Wallpapers".

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
| 2026-11-04 | Eigene Stile nur für die Hintergrundbild-App (Wunsch Andreas): Hügelkette, Planet, Retro-Bögen, Pixelverlauf, Punktverlauf, Papierfalten in `apps/wallpapers/lib/styles`, als normale `ToolDefinition` (Schema, mindestens 6 Looks, `randomize`, SVG-Render) nur in der Registry-Kopie dieser App registriert. Teilen-Link, Leertaste, Feinschliff und Export funktionieren ohne Sonderweg; Musterli sieht sie nicht. Zellen und Punkte in Design-Pixeln mit Obergrenze (12 000 bzw. 16 000), SVG unter 2.5 MB |
| 2026-11-04 | Zweite Welle eigener Stile (Wunsch Andreas): Schweizer Plakat, Polarlicht, Iso-Würfel, Moiré, Strahlen, Glaskugeln, Op-Art, Kammlinien, ebenfalls in `lib/styles`. Leuchten ohne Unschärfe-Filter (gestapelte Bänder mit `screen`), Kugeln aus Verläufen statt Filtern, Würfel und Ringe mit Obergrenze; auf Handys bleiben Glaskugeln und Kammlinien unter der Uhr |
| 2026-11-04 | Dritte Welle eigener Stile (Wunsch Andreas): Flüssiges Glas, Seide, Dünen, Kamera-Halo. Glas zeigt das Farbfeld vergrössert und versetzt im Ausschnitt (`<use>` mit Transform, ohne Unschärfe); Seide als beleuchtetes Höhenfeld in ein kleines PNG (längste Kante 420 px, `pngDataUri` aus der Engine), das SVG skaliert es weich hoch; Kamera-Halo schätzt die Kameraposition aus dem Seitenverhältnis (hohe Handys: Dynamic Island bei 3.5 % der Höhe, sonst Mitte oben), weil Generatoren das Gerät nicht kennen | Hochwertige Looks, die andere Hintergrundbild-Seiten kaum haben; Seide braucht echte Schattierung, die als Vektor zu gross würde |
| 2026-11-04 | T2: Shader-Verlauf noch nicht als Stil. Er braucht einen zweiten, asynchronen Render-Pfad (Shader-Worker über `@musterli/editor-ui/render-image`) für Vorschau, Paare und Sets; folgt in T3 zusammen mit den neuen Generatoren |
| 2026-11-04 | Neue Bedienung für Touch (Wunsch Andreas): dunkle Bühne, ein Tipp aufs Bild gibt einen neuen Look; auf dem Handy Reiter Stil, Look, Feinschliff, Gerät mit Vorschaubildern und eine klebende Leiste unten mit Zufall und Herunterladen (Menü als Bottom Sheet, am Desktop als Popover); eigene Schieberegler und Schalter mit mindestens 44 px Trefferfläche; Icons aus `lucide-react` (wie in `apps/web`), Vorschaubilder einmal pro Stil und Vorlage zwischengespeichert (`lib/thumbs.ts`) | Die alte Oberfläche wirkte veraltet und war auf dem Handy umständlich; Stile wählt man schneller über Bilder als über Namen, keine neue grosse Dependency |

## Aufbau

- `apps/wallpapers`: Next.js-App (App Router, next-intl, Tailwind), eigener Worker `wallpapers-web`, Deploy über `.github/workflows/deploy-wallpapers.yml` (nur bei Änderungen an der App, an `packages/devices`, `packages/config` oder am Lockfile).
- `packages/devices`: Gerätekatalog (native Pixel in natürlicher Ausrichtung, Gruppen, Safe Zones als Anteile der Leinwand) und `detectScreen` (erkennt das Gerät aus Bildschirmgrösse und Pixelverhältnis). Ids sind stabil, nie umbenennen. Auflösungen jeden Herbst mit den Herstellerangaben abgleichen.
- Editor (`components/wallpaper-editor.tsx`, nur im Browser geladen): 36 SVG-Stile (18 aus Musterli, 18 eigene in `lib/styles`) in zwei Gruppen «Weich» und «Grafisch» (Wunsch Andreas 2026-11-04: Bauhaus, Geometrisch, Neon, Glitch, Retro-Gitter, Streifen, Guilloche, Terrazzo, Punktringe, Sternenhimmel kamen in T2 dazu) aus `@musterli/tool-registry` (`lib/generators.ts`), Vorschau und Export über denselben Render-Pfad (`renderDesignSvg`, `exportRaster` aus `@musterli/exporters`). Der Generator rendert in CSS-Pixeln (native Grösse geteilt durch den grössten ganzzahligen Teiler bis zum Pixelverhältnis, `lib/target.ts`), der Export skaliert auf die native Grösse; so sind Linien so dick wie auf dem Bildschirm. Teilen-Link `#d=<Musterli-Code>&t=<Geräte-Id oder BxH>&f=<Körnung>.<Abdunkeln>.<Uhr 0|1>` (`lib/share.ts`, `f` fehlt ohne Feinschliff, T1-Links bleiben gültig).
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

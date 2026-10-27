# PRODUCT.md: Produktdefinition

> Arbeitstitel: **Motivo** (Name, Domain und Marke vor dem Launch prüfen). Überall im Code als Konstante `APP_NAME` führen, damit ein Rename trivial bleibt.

## 1. Vision in einem Satz

Eine Toolbox, mit der jede Person in Sekunden markengerechte Hintergründe, Muster, Verläufe und Bildeffekte erzeugt und sie als Bild, Vektor, Code oder Animation exportiert, ohne Designkenntnisse.

## 2. Positionierung gegenüber MagicPattern

Wir bauen den bewährten Kern nach (schnelle Generatoren, Randomize, breite Exporte, SEO-Seiten) und differenzieren uns in fünf Punkten:

| # | Differenzierung | Warum es zählt |
|---|---|---|
| 1 | **Ein Canvas für alles ("Composer")**: Ergebnisse mehrerer Tools als Ebenen kombinieren (z. B. Shader-Verlauf + Grain + Pattern-Overlay + Logo) | MagicPattern ist eine Sammlung isolierter Tools |
| 2 | **Brand Kit, das sich selbst füllt**: Logo hochladen oder URL eingeben, Farben/Fonts werden extrahiert und überall angewendet | Bei MagicPattern nur rudimentär |
| 3 | **KI-Parameter ("Describe it")**: "ruhiger, pastelliger Hintergrund für eine Zahnarztpraxis" erzeugt passende Tool-Parameter | Kein KI-Workflow beim Vorbild |
| 4 | **Code-first-Exporte**: zusätzlich React-Komponente, Tailwind-Klasse, CSS-Variablen, animierter Shader als Web-Component | Entwickler als zahlende Zielgruppe |
| 5 | **DACH/Schweiz-first**: DE/FR/IT/EN, Preise in CHF und EUR, TWINT, Daten in Europa, nDSG/DSGVO-konform | Englisch-only und USD beim Vorbild |
| 6 | **Lifetime als Kernmodell**: einmal zahlen, alle künftigen Tools inklusive, kein Abo | Beim Vorbild nur gelegentliche Aktion neben Abos |

## 3. Zielgruppen (Personas)

1. **Lena, Marketing in einem KMU** (keine Designerin): braucht schnell Social Posts und Header im CI. Will Vorlagen, Brand Kit, Magic Resize.
2. **Marco, Frontend-Entwickler / Indie Hacker**: will Hintergründe für Landingpages als CSS/SVG/React, ohne Figma zu öffnen. Zahlt für Code-Exporte und API.
3. **Sara, Freelance-Designerin / Agentur**: braucht Variationen in Masse, kommerzielle Lizenz, Weiterverkaufsrecht, Figma-Plugin.
4. **Team-Admin in einer Agentur** (später): geteilte Brand Kits, Ordner, Rollen, Rechnung auf Firma.

## 4. Jobs to be done

- "Gib mir in 10 Sekunden einen Hintergrund, der zu meiner Marke passt."
- "Ich will das als Code in mein Projekt kopieren, nicht als 4-MB-PNG."
- "Mach dasselbe Motiv in 6 Formaten für alle Kanäle."
- "Ich will meinen Stand speichern und nächste Woche weiterarbeiten."

## 5. Funktionsumfang

Prioritäten: **P0** = MVP, **P1** = Bezahl-Launch, **P2** = Wachstum, **P3** = später. Die vollständige Tool-Spezifikation steht in `TOOLS.md`.

### 5.1 Plattform
| Feature | Prio |
|---|---|
| Generische Editor-Shell (Parameter-Panel, Live-Vorschau, Export-Dialog, Randomize, Undo/Redo) | P0 |
| Tool-Katalog mit Kategorien, Suche, Filter "Gratis" | P0 |
| SEO-Landingpage pro Tool (Was ist, Anleitung, FAQ, verwandte Tools) | P0 |
| Light/Dark Mode, Tastaturkürzel | P0 |
| Accounts (E-Mail Magic Link, Google, Apple) | P1 |
| Designs speichern, Dashboard mit Ordnern, Duplizieren, Suchen | P1 |
| Brand Kit v1: Paletten, eigene SVG-Shapes, Logos, Fonts | P1 |
| Lifetime-Lizenzen, Upgrades und Credit-Packs (Stripe Einmalzahlung, CHF/EUR/USD, TWINT) | P1 |
| Share-Links (Read-only-Vorschau eines Designs, "Remix") | P2 |
| Community: öffentliche Packs, Paletten, Templates; Likes, Remix-Zähler | P2 |
| Composer (Ebenen aus mehreren Tools) | P2 |
| KI-Parameter ("Describe it"), Brand Kit aus URL | P2 |
| Öffentliche API, Figma- und Framer-Plugin | P2 |
| Teams/Workspaces, Rollen, gemeinsame Bibliotheken | P3 |
| Embeddable Widget für Drittprodukte (Enterprise) | P3 |

### 5.2 Exporte
| Format | Wo | Prio |
|---|---|---|
| PNG, JPG, WebP (frei wählbare Grösse, transparent wo sinnvoll) | alle visuellen Tools | P0 |
| SVG (sauber, Illustrator/Figma-kompatibel) | Vektor-Tools | P0 |
| CSS-Snippet (background, data-URI, Gradient) | Pattern/Gradient-Tools | P0 |
| In Zwischenablage kopieren (Bild und Code) | alle | P0 |
| GIF (Loop aus Varianten) | Patterns | P1 |
| MP4/WebM (Loop) | Shader, später Mesh/Blobs/Waves | P1 |
| Tailwind-Config, CSS-Variablen, OKLCH | Farbtools | P0 |
| React-Komponente / Web-Component | Pattern, Gradient, Shader | P2 |

## 6. Monetarisierung: Lifetime statt Abo

**Grundentscheid**: Motivo wird **einmal gekauft und gehört dir für immer**. Es gibt keine Abos. Das ist zugleich unser stärkstes Verkaufsargument gegenüber dem Vorbild (das Lifetime nur als gelegentliche Aktion anbietet) und gegenüber der "Abo-Müdigkeit" vieler Kreativer.

Damit das wirtschaftlich trägt, gilt eine harte Regel: **Alles, was uns pro Nutzer laufend Geld kostet, ist entweder gedeckelt oder läuft über Credits.** Dank clientseitigem Rendering (siehe `ARCHITECTURE.md`) kosten die Tools selbst praktisch nichts. Laufende Kosten entstehen nur bei Speicher, KI und API.

### 6.1 Lizenzen (Vorschlag, Preise vor Launch mit Nutzertests validieren)

| Stufe | Preis einmalig (CHF) | Inhalte |
|---|---|---|
| **Free** | 0 | Alle Gratis-Tools, Export bis 1080 px, Wasserzeichen nur bei Social-Editor und Composer, 5 gespeicherte Designs, persönliche Nutzung |
| **Lifetime Solo** | 89 (Early Bird ab 49) | **Alle Tools, auch alle künftigen**, Export bis 4K, Video bis 1080p, GIF, 1'000 gespeicherte Designs, 2 Brand Kits, kommerzielle Nutzung, 20 KI-Credits pro Monat inklusive |
| **Lifetime Pro** | 179 (Early Bird ab 99) | Alles aus Solo plus 8K-Export, Video bis 4K, unbegrenzt gespeicherte Designs (Fair Use), 10 Brand Kits, Code-Exporte (React/Web-Component), API-Zugang (Basiskontingent), 100 KI-Credits pro Monat, Weiterverkaufsrecht |
| **Lifetime Team** | ab 449 für 5 Sitze, weitere Sitze je 69 | Pro für alle Sitze + Workspace, Rollen, geteilte Bibliothek (P3) |
| **Upgrade Solo zu Pro** | Differenzbetrag | jederzeit, zum dann gültigen Preis abzüglich bezahltem Betrag |
| **Credit-Packs** | z. B. 9 (200 Credits), 29 (1'000 Credits) | Für KI-Funktionen und API über das Inklusivkontingent hinaus; verfallen nicht |

Preise in CHF, EUR und USD separat festlegen (nicht nur umrechnen, runde Beträge pro Währung).

### 6.2 Preistreppe für den Launch

Lifetime-Produkte leben vom Start-Momentum. Vorschlag:

| Phase | Kontingent | Solo | Pro |
|---|---|---|---|
| **Founders** (Warteliste, ab Gratis-Beta) | erste 300 Lizenzen | 49 | 99 |
| **Early Bird** (Bezahl-Launch) | nächste 700 Lizenzen | 69 | 139 |
| **Regulär** | danach | 89 | 179 |

- Zähler "Noch X Founders-Lizenzen" ehrlich und serverseitig berechnet (keine künstliche Verknappung).
- Preise dürfen später steigen, wenn neue grosse Tools dazukommen. Wer schon gekauft hat, bekommt alles ohne Aufpreis.
- Optional: Lifetime-Deal-Plattformen (z. B. AppSumo) als Launch-Kanal prüfen. Achtung: hohe Provisionen und eine sehr support-intensive Käuferschaft. Konditionen vorab genau ansehen.

### 6.3 Was "Lifetime" konkret heisst (muss so in die AGB)

- **Lebensdauer des Produkts**, nicht der Person. Lizenz ist an einen Account gebunden, nicht übertragbar (Team-Sitze ausgenommen, die sind umhängbar).
- **Inklusive**: alle bestehenden und künftigen Tools, Exporte, Templates, Shape-Packs und Updates der Motivo-Toolbox.
- **Nicht inklusive**: Credits über das Monatskontingent hinaus; allfällige separate künftige Produkte unter anderem Namen.
- **Fair Use** bei "unbegrenzt": Schutz vor Missbrauch (z. B. automatisierte Massenspeicherung), in AGB mit konkreten Zahlen.
- **Exit-Versprechen**: Falls Motivo je eingestellt wird, mindestens 12 Monate Vorankündigung und kompletter Datenexport (Designs als JSON + gerenderte Dateien). So wird "für immer" glaubwürdig.

### 6.4 Fairness-Regeln
- **14 Tage Geld-zurück**, solange keine Exporte in Lifetime-Qualität (über 1080 px, Video, Code) erfolgt sind. Exporte werden protokolliert.
- Keine Abo-Falle, keine automatische Verlängerung, keine versteckten Kosten. Credits werden vor jeder Nutzung angezeigt.
- Lizenztext pro Stufe klar und kurz in DE/FR/IT/EN.

### 6.5 Wirtschaftlichkeit (Leitplanken)

- **Laufende Kosten pro Lifetime-Nutzer** müssen sehr tief bleiben: Designs sind kleine JSONs, Thumbnails klein (WebP, 400 px), Rendering im Browser. Ziel: unter CHF 0.05 pro aktivem Nutzer und Monat für Hosting und Speicher (nach M3 messen).
- **KI und API kosten pro Aufruf** und laufen deshalb ausschliesslich über Credits (Inklusivkontingent + Packs). Der Credit-Preis deckt die Modellkosten mit Marge.
- **Einnahmequellen** über die Zeit: Neukäufe (SEO als Motor), Upgrades Solo zu Pro, Credit-Packs, Team-Lizenzen, später Enterprise/Widget-Lizenzen.
- **Fixkosten-Runway**: Ein Teil jedes Lifetime-Verkaufs (Vorschlag 30 %) gedanklich als Reserve für künftige Betriebskosten behandeln, nicht als frei verfügbaren Gewinn.
- Rechenbeispiel zum Plausibilisieren (Annahmen, keine Prognose): 1'500 Lizenzen im ersten Jahr zu durchschnittlich CHF 90 ergeben CHF 135'000 Umsatz vor Gebühren, MWST und Kosten. Danach müssen monatliche Neukäufe die Fixkosten decken.

Grundsatz bleibt: **Gratis muss wirklich nützlich sein** (SEO und Vertrauen). Bezahlt wird einmal für Speichern, Brand, hohe Auflösung, Video, Code-Komponenten, Lizenz und Zeitersparnis.

## 7. Erfolgsmessung (KPIs)

- **Aktivierung**: Anteil Besucher eines Tools mit mindestens einem Export (Ziel > 25 %).
- **Time to first export**: Median unter 30 Sekunden.
- **Kaufkonversion** Free zu Lifetime: Ziel 2 bis 4 % der aktiven Accounts (einmalige Kaufentscheidung ist leichter als ein Abo).
- **Neukäufe pro Monat** und **Umsatz pro Monat**: die wichtigste Zahl, weil es keine wiederkehrenden Einnahmen gibt.
- **Upgrade-Quote** Solo zu Pro und **Credit-Pack-Anteil** unter Käufern.
- **Refund-Quote**: unter 5 %.
- **Kosten pro aktivem Lifetime-Nutzer und Monat** (Hosting, Speicher, KI netto): muss dauerhaft im Zielkorridor bleiben.
- **SEO**: Anzahl indexierter Tool- und Inhaltsseiten, organische Klicks pro Woche.
- **Aktive Käufer**: Anteil Lifetime-Nutzer mit Login in den letzten 30 Tagen (Basis für Mundpropaganda und Upgrades).
- **Performance**: LCP < 2,0 s auf Tool-Seiten, Vorschau-Update < 16 ms für Vektor-Tools.

## 8. Nicht-Ziele (bewusst ausgeschlossen)

- Kein vollwertiger Vektor-Editor à la Figma oder Illustrator.
- Keine KI-Bildgenerierung (Diffusion) im MVP: Kosten, Lizenzfragen, und es ist nicht unser Kern. Unsere KI steuert **Parameter**, sie malt keine Pixel.
- Keine nativen Apps im ersten Jahr (Web zuerst, responsive bis Tablet; Mobile nur Ansicht und einfache Tools).
- Keine Übernahme fremder Shapes, Templates oder Texte (siehe `ANALYSE.md`, Abschnitt 6).

## 9. Rechtliches und Compliance (Schweiz/EU)

- **nDSG und DSGVO**: Datenhaltung in der EU oder Schweiz, Datenschutzerklärung, Auftragsverarbeitungsverträge mit allen Anbietern, Cookie-Banner nur wenn nötig (Analytics cookiefrei bevorzugen, z. B. Plausible oder selbst gehostetes Umami).
- **Impressum** und AGB mit Lizenzbedingungen für Exporte und Community-Uploads, inklusive der Lifetime-Definition aus Abschnitt 6.3 (juristisch prüfen lassen, insbesondere Fair Use und Einstellungsfall).
- **MWST**: Schweizer MWST ab Umsatzschwelle beachten, EU-OSS für digitale Dienstleistungen an EU-Privatkunden. Mit Treuhand klären; Stripe Tax kann helfen.
- Marke und Domain vor dem Launch prüfen (Swissreg, EUIPO).

# PRODUCT.md: Produktdefinition

> Arbeitstitel: **Motivo** (Name, Domain und Marke vor dem Launch prüfen). Überall im Code als Konstante `APP_NAME` führen, damit ein Rename trivial bleibt.

## 1. Vision in einem Satz

Eine Toolbox, mit der jede Person in Sekunden markengerechte Hintergründe, Muster, Verläufe und Bildeffekte erzeugt und sie als Bild, Vektor, Code oder Animation exportiert, ohne Designkenntnisse.

## 2. Positionierung gegenüber MagicPattern

Wir bauen den bewährten Kern nach (schnelle Generatoren, Randomize, breite Exporte, SEO-Seiten) und differenzieren uns in diesen Punkten:

| # | Differenzierung | Warum es zählt |
|---|---|---|
| 1 | **Ein Canvas für alles ("Composer")**: Ergebnisse mehrerer Tools als Ebenen kombinieren (z. B. Shader-Verlauf + Grain + Pattern-Overlay + Logo) | MagicPattern ist eine Sammlung isolierter Tools |
| 2 | **Brand Kit im Browser**: Paletten, Logos und eigene Shapes lokal speichern und überall anwenden, ohne Konto | Bei MagicPattern nur rudimentär und nur mit Konto |
| 4 | **Code-first-Exporte**: zusätzlich React-Komponente, Tailwind-Klasse, CSS-Variablen, animierter Shader als Web-Component | Entwickler als wichtige Zielgruppe |
| 5 | **DACH/Schweiz-first**: DE/FR/IT/EN, keine Personendaten auf Servern, nDSG/DSGVO-konform | Englisch-only beim Vorbild |
| 6 | **Komplett gratis, ohne Konto, spendenfinanziert**: alle Tools und Exporte frei, kein Login, keine Bezahlschranke, kein Tracking | Beim Vorbild Abo und Bezahlschranke |

## 3. Zielgruppen (Personas)

1. **Lena, Marketing in einem KMU** (keine Designerin): braucht schnell Social Posts und Header im CI. Will Vorlagen, Brand Kit, Magic Resize.
2. **Marco, Frontend-Entwickler / Indie Hacker**: will Hintergründe für Landingpages als CSS/SVG/React, ohne Figma zu öffnen. Schätzt Code-Exporte.
3. **Sara, Freelance-Designerin / Agentur**: braucht Variationen in Masse, freie kommerzielle Nutzung der Exporte, Figma-Plugin.

## 4. Jobs to be done

- "Gib mir in 10 Sekunden einen Hintergrund, der zu meiner Marke passt."
- "Ich will das als Code in mein Projekt kopieren, nicht als 4-MB-PNG."
- "Mach dasselbe Motiv in 6 Formaten für alle Kanäle."
- "Ich will meinen Stand speichern und nächste Woche weiterarbeiten." (lokal im Browser oder als Datei, ohne Konto)

## 5. Funktionsumfang

Prioritäten: **P0** = MVP, **P1** = öffentlicher Launch, **P2** = Wachstum, **P3** = später. Die vollständige Tool-Spezifikation steht in `TOOLS.md`.

### 5.1 Plattform
| Feature | Prio |
|---|---|
| Generische Editor-Shell (Parameter-Panel, Live-Vorschau, Export-Dialog, Randomize, Undo/Redo) | P0 |
| Tool-Katalog mit Kategorien, Suche, Filter "Gratis" | P0 |
| SEO-Landingpage pro Tool (Was ist, Anleitung, FAQ, verwandte Tools) | P0 |
| Light/Dark Mode, Tastaturkürzel | P0 |
| Share-Links (Design steckt im Link, kein Server) | P0 |
| Designs lokal speichern (IndexedDB), Übersicht "Meine Designs" mit Suchen, Duplizieren, Löschen; Export/Import als Datei für andere Geräte | P1 |
| Brand Kit lokal: Paletten, eigene SVG-Shapes, Logos; Export/Import als Datei | P1 |
| Spenden-Seite und dezenter Spenden-Hinweis (externer Anbieter, keine Zahlungsintegration) | P1 |
| Composer (Ebenen aus mehreren Tools) | P2 |
| Figma- und Framer-Plugin (gratis) | P2 |

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

## 6. Finanzierung: gratis und spendenfinanziert

**Grundentscheid (2026-10-28, Andreas)**: Motivo ist **komplett gratis**. Es gibt **keine Konten, keine Bezahlfunktionen, keine Lizenzen, keine Credits und keine Bezahlschranke**. Alle Tools, Auflösungen und Exporte stehen allen offen. Finanziert wird der Betrieb über **freiwillige Spenden**.

### 6.1 Spenden
- Spenden laufen über einen **externen Anbieter** (Entscheid Andreas, siehe `PROGRESS.md`). Motivo verlinkt nur dorthin: keine Zahlungsintegration, keine Kundendaten, keine Webhooks, keine Cookies auf unserer Domain.
- Eine eigene Seite "Unterstützen" erklärt kurz, wofür Spenden gebraucht werden (Domain, Hosting, Weiterentwicklung). Im Editor und im Footer höchstens ein **dezenter Hinweis**, nie ein Popup, nie eine Sperre, nie ein Wasserzeichen.
- Optional später: transparente Seite mit Kosten und Spendeneingang pro Jahr.

### 6.2 Kostenregeln
- **Keine laufenden Kosten pro Nutzer.** Alles läuft im Browser: Rendern, Exportieren, Speichern (IndexedDB), Brand Kit, Uploads.
- Server nur für statische Seiten und Share-Link-Auflösung im Rahmen des Cloudflare-Gratis-Kontingents. Fixkosten möglichst bei Domain plus allenfalls einem kleinen Fixbetrag.
- Funktionen, die pro Nutzer Geld kosten (KI-Aufrufe, Server-Speicher, öffentliche API, Server-Rendering), werden **nicht gebaut**. Ausnahme nur mit Entscheid Andreas und fixem, durch Spenden gedecktem Budget mit hartem Tageslimit.

### 6.3 Lizenz der Exporte
- Exporte dürfen frei genutzt werden, auch kommerziell. Kurzer, klarer Lizenztext in DE/FR/IT/EN (juristisch zu prüfen).

Grundsatz: **Gratis muss wirklich nützlich sein.** Keine künstlichen Einschränkungen, keine Dark Patterns.

## 7. Erfolgsmessung (KPIs)

Gemessen nur cookiefrei und aggregiert (Cloudflare Web Analytics), ohne Konten.

- **Aktivierung**: Anteil Besucher eines Tools mit mindestens einem Export (Ziel > 25 %).
- **Time to first export**: Median unter 30 Sekunden.
- **Spenden**: Spendeneingang pro Monat im Verhältnis zu den Fixkosten (Ziel: Fixkosten gedeckt).
- **Fixkosten pro Monat** (Domain, Hosting): bleiben im Gratis- oder Kleinstbereich.
- **SEO**: Anzahl indexierter Tool- und Inhaltsseiten, organische Klicks pro Woche.
- **Performance**: LCP < 2,0 s auf Tool-Seiten, Vorschau-Update < 16 ms für Vektor-Tools.

## 8. Nicht-Ziele (bewusst ausgeschlossen)

- Kein vollwertiger Vektor-Editor à la Figma oder Illustrator.
- Keine KI-Bildgenerierung und keine KI-Parameter über bezahlte Modelle (laufende Kosten).
- **Keine Konten, keine Zahlungen, keine Lizenzen oder Credits** (Entscheid 2026-10-28). Keine Funktionen mit laufenden Kosten pro Nutzer (KI-Aufrufe, Server-Speicher, öffentliche API, Community mit Server-Daten, Teams).
- Keine nativen Apps im ersten Jahr (Web zuerst, responsive bis Tablet; Mobile nur Ansicht und einfache Tools).
- Keine Übernahme fremder Shapes, Templates oder Texte (siehe `ANALYSE.md`, Abschnitt 6).

## 9. Rechtliches und Compliance (Schweiz/EU)

- **nDSG und DSGVO**: keine Konten, keine Personendaten auf unseren Servern, keine Cookies. Datenschutzerklärung nennt Hosting (Cloudflare), Analytics und Fehlerberichte (falls aktiv) und den externen Spendenanbieter.
- **Impressum** und kurze Nutzungsbedingungen mit Lizenz für Exporte (juristisch zu prüfen).
- **Spenden**: steuerliche Behandlung von Spenden an eine Privatperson bzw. Einzelfirma mit Treuhand klären (juristisch/steuerlich zu prüfen). Keine Gegenleistung versprechen, damit es eine Spende bleibt.
- Marke und Domain vor dem Launch prüfen (Swissreg, EUIPO).

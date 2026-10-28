# Lizenzen der Assets

Jede Asset-Quelle, die Musterli ausliefert (Formen, Fonts, Bilder, Vorlagen), steht hier mit Herkunft und Lizenz. Neue Quellen nur mit OFL-, Apache-, CC0- oder gleichwertiger Lizenz und mit Eintrag in dieser Datei (siehe `CLAUDE.md`, Abschnitt Inhalte und Recht).

## Formenbibliothek (M4-AP01)

| Quelle | Umfang | Herkunft | Lizenz |
|---|---|---|---|
| `packages/engine/src/shapes/` | 170 Formen in 12 Packs (`basics`, `geometric`, `organic`, `blobs`, `stars`, `lines`, `retro`, `bauhaus`, `nature`, `symbols`, `tiles`, `decorative`) | Eigene Arbeit für Musterli, 2026. Im Code aus Grundgeometrie gezeichnet: Kreise, Bögen, regelmässige Vielecke, Bezier- und Catmull-Rom-Kurven, Kleckse aus festen Seeds des eigenen PRNG. Keine Vorlage, kein Abpausen, keine Übernahme aus magicpattern.design, Icon-Sets, Fonts oder anderen Produkten. | Eigentum des Projekts Musterli; keine Fremdrechte |
| `packages/engine/src/shapes/packs/basics.ts`, `organic.ts`, `nature.ts`, `stars.ts`, `lines.ts`, `retro.ts`, `symbols.ts` (24 Formen) | Die ursprünglichen Formen von Seamless Patterns (M3-AP12), unverändert übernommen | Eigene Arbeit für Musterli, 2026 | wie oben |

Hinweise:

- Formen bestehen nur aus Pfaddaten (keine Schrift-Glyphen, keine Emojis, keine Markenzeichen).
- Allgemein bekannte Motive (Herz, Stern, Pfeil, Truchet-Viertelkreise, Vierpass) sind allgemein verbreitete Grundformen; die konkreten Pfade sind selbst konstruiert.
- Brand-Kit-Shapes der Nutzerinnen und Nutzer bleiben in deren Browser und sind nicht Teil der Bibliothek.

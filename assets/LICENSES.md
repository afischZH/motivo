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

## UI-Bausteine (Neuauftritt 2026-10-29)

| Quelle | Umfang | Herkunft | Lizenz |
|---|---|---|---|
| shadcn/ui (`apps/web/components/ui/`) | Basiselemente Button, Badge, Card, Input, Separator, Sheet | https://ui.shadcn.com, per `shadcn add` | MIT, Copyright (c) 2023 shadcn |
| Shadcn Space, freie Blöcke `navbar-01`, `footer-01`, `faq-01`, `bento-grid-03` | Als Vorlage für Kopf, Fuss, FAQ und Funktionsraster; stark angepasst, eigene Texte, keine Bilder, Logos oder Animationen übernommen | https://shadcnspace.com, Registry `@shadcn-space` in `apps/web/components.json` | Shadcn Space Free License (siehe unten) |
| Lucide (`lucide-react`) | Icons in den UI-Bausteinen | https://lucide.dev | ISC |

Lizenztext Shadcn Space (Free License, https://shadcnspace.com/license, abgerufen 2026-10-29):

> Copyright (c) 2026 Shadcn Space
>
> Our UI materials are free to use. You are free to use these components and templates in personal projects, commercial projects, and client work. You can also share or distribute them if needed.
>
> You can: Download and use the templates or components. Copy the code. Change or edit it for your needs. Share it with others. Use it in personal or commercial projects. Sell projects that are built using this code. You do not need special permission for any of the above.
>
> You must not: Scam anyone using the Shadcn Space name. Pretend the components are your original product. Use the Shadcn Space brand, logo, or name as your own. Misuse or misrepresent Shadcn Space intellectual property.
>
> If you copy or share the software, you must include: This copyright notice. This license text. Include them in all copies or important parts of the software.
>
> This software is provided "as is". No guarantees. No promise that everything will work perfectly. You use it at your own risk. Shadcn Space is not responsible for bugs, data loss, project issues or any damage caused by using this software.

Hinweis: Nur Gratis-Blöcke ohne Framer Motion (`motion`) und ohne `@iconify/react` werden verwendet. Pro-Blöcke sind ausgeschlossen.

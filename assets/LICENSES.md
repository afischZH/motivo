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
| shadcn/ui (`apps/web/components/ui/`) | Basiselemente Button, Badge, Card, Input, Separator, Sheet; Button, Badge und Input im Stil Maia (Registry `radix-maia`), Tooltip- und Kbd-Muster im Editor | https://ui.shadcn.com, per `shadcn add` | MIT, Copyright (c) 2023 shadcn |
| Shadcn Space, freie Blöcke `navbar-01`, `footer-01`, `faq-01`, `bento-grid-03` | Als Vorlage für Kopf, Fuss, FAQ und Funktionsraster; stark angepasst, eigene Texte, keine Bilder, Logos oder Animationen übernommen | https://shadcnspace.com, Registry `@shadcn-space` in `apps/web/components.json` | Shadcn Space Free License (siehe unten) |
| Lucide (`lucide-react`) | Icons in den UI-Bausteinen | https://lucide.dev | ISC |
| Konva 10.9.0 (`konva`, nur `konva/lib/Core` und einzelne Formen) | Bühne des Social-Media-Editors (M6-AP02), nur auf der Editor-Seite per `import()` geladen | https://konvajs.org, https://github.com/konvajs/konva | MIT, Copyright (C) 2011 - 2013 Eric Rowell (KineticJS), (C) 2014 - present Anton Lavrenov (Konva) |

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

## Schriften des Social-Media-Editors (M6-AP03)

Alle Schriften stehen unter der SIL Open Font License 1.1 (OFL). Quelle sind die Originaldateien im Repository google/fonts (https://github.com/google/fonts, Branch `main`, Ordner `ofl/<familie>/`, Stand 2026-10-29), Lizenz geprüft in `METADATA.pb` (`license: "OFL"`) und `OFL.txt` jeder Familie. Gebaut mit `assets/fonts/build-fonts.py` (fontTools 4.68): variable Schriften auf das Gewicht festgelegt (übrige Achsen auf dem Standardwert), Teilmengen `latin` und `latin-ext` wie bei Google Fonts, ohne Hinting, als WOFF2. Ausgeliefert unter `apps/web/public/fonts/<id>/` mit dem unveränderten `OFL.txt` der Familie daneben (die OFL verlangt den Lizenztext bei jeder Weitergabe). Geladen nur im Editor, von der eigenen Domain (`font-src 'self'`).

| Schrift | Id | Gewichte | Version | Quelle (google/fonts) | Copyright | Lizenz |
|---|---|---|---|---|---|---|
| Inter | `inter` | 400, 700 | 4.001 | `ofl/inter/Inter[opsz,wght].ttf` | Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter) | OFL 1.1 |
| Roboto Flex | `roboto-flex` | 400, 700 | 3.200 | `ofl/robotoflex/RobotoFlex[…,wght].ttf` | Copyright 2017 The Roboto Flex Project Authors (https://github.com/TypeNetwork/Roboto-Flex) | OFL 1.1 |
| Poppins | `poppins` | 400, 700 | 4.004 | `ofl/poppins/Poppins-Regular.ttf`, `Poppins-Bold.ttf` | Copyright 2020 The Poppins Project Authors (https://github.com/itfoundry/Poppins) | OFL 1.1 |
| Montserrat | `montserrat` | 400, 700 | 9.000 | `ofl/montserrat/Montserrat[wght].ttf` | Copyright 2024 The Montserrat.Git Project Authors (https://github.com/JulietaUla/Montserrat.git) | OFL 1.1 |
| Space Grotesk | `space-grotesk` | 400, 700 | 2.000 | `ofl/spacegrotesk/SpaceGrotesk[wght].ttf` | Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk) | OFL 1.1 |
| Fraunces | `fraunces` | 400, 700 | 1.000 | `ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf` | Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces) | OFL 1.1 |
| EB Garamond | `eb-garamond` | 400, 700 | 1.003 | `ofl/ebgaramond/EBGaramond[wght].ttf` | Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12) | OFL 1.1 |
| DM Serif Display | `dm-serif-display` | 400 | 5.200 | `ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf` | Copyright 2014-2018 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. Copyright 2019 Google LLC. | OFL 1.1 |
| Bebas Neue | `bebas-neue` | 400 | 2.000 | `ofl/bebasneue/BebasNeue-Regular.ttf` | Copyright © 2010 by Dharma Type | OFL 1.1 |
| JetBrains Mono | `jetbrains-mono` | 400, 700 | 2.211 | `ofl/jetbrainsmono/JetBrainsMono[wght].ttf` | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) | OFL 1.1 |
| Caveat | `caveat` | 400, 700 | 2.000 | `ofl/caveat/Caveat[wght].ttf` | Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat) | OFL 1.1 |
| Pacifico | `pacifico` | 400 | 3.001 | `ofl/pacifico/Pacifico-Regular.ttf` | Copyright 2018 The Pacifico Project Authors (https://github.com/googlefonts/Pacifico) | OFL 1.1 |

Hinweise:

- **Reserved Font Names**: Teilmengen sind nach der OFL eine Veränderung, und eine veränderte Fassung darf keinen reservierten Namen tragen. Darum fehlen Lora, Playfair Display und Merriweather (ihr reservierter Name ist ihr Schriftname). DM Serif Display reserviert nur den Namen "Source", den die Schrift nicht trägt.
- Die Schriften werden nicht verkauft (OFL Abschnitt 1) und nur zusammen mit dem Lizenztext ausgeliefert. Die interne Familie im Browser heisst `musterli-<id>`, damit eine lokal installierte Schrift gleichen Namens die Vorschau nicht verändert.
- Grösse: 42 Dateien, zusammen 780 KiB; nur `latin` aller Schriften 397 KiB. Der Editor lädt nur, was der Text braucht (meist eine Datei pro Schrift und Gewicht, z. B. Inter 400 latin 20 KiB).
- **Testschrift** `apps/web/e2e/fixtures/brand-test.ttf` (nur für die E2E-Tests, nicht ausgeliefert): aus Pacifico 3.001 (OFL 1.1, Copyright 2018 The Pacifico Project Authors) auf ASCII reduziert und in "Musterli Test Brand" umbenannt.
- Brand-Schriften der Nutzerinnen und Nutzer bleiben in deren Browser (IndexedDB) und sind nicht Teil von Musterli. Für ihre Lizenz sind sie selbst verantwortlich; der Hinweis im Brand Kit erinnert daran.

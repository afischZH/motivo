# SETUP-WAITLIST.md: Founders-Warteliste einschalten

Die Warteliste (M2-AP10, Technik in `docs/ARCHITECTURE.md` Abschnitt 14) ist im Code fertig und bleibt aus, bis die Schritte unten erledigt sind. Solange zeigt die Website "Die Warteliste öffnet bald". Alle Dienste laufen im Gratis-Tarif.

Reihenfolge: 1. Supabase, 2. Resend mit Domain, 3. Turnstile, 4. Secrets und Variablen, 5. Test. Für Resend braucht es die endgültige Domain.

## 1. Supabase-Projekt in Zürich

1. Auf [supabase.com](https://supabase.com) ein Konto anlegen bzw. anmelden, neue Organisation (Plan **Free**).
2. **New project**: Name `motivo`, sicheres Datenbank-Passwort (im Passwort-Manager ablegen), Region **Central EU (Zurich)**, technisch `eu-central-2`. Die Region lässt sich später nicht ändern.
3. Unter **Project Settings > Data API** den Schalter für automatische Tabellen-Freigaben prüfen: Neue Tabellen sollen nicht automatisch für `anon` freigegeben werden, falls die Option angeboten wird. (Die Migration entzieht die Rechte ohnehin selbst.)
4. Migration anwenden, eine der zwei Varianten:
   - **CLI** (empfohlen), im Repo-Wurzelordner:
     ```bash
     npx supabase login
     npx supabase link --project-ref <projekt-ref>   # Ref steht in der Projekt-URL
     npx supabase db push                            # wendet supabase/migrations/* an
     ```
   - **SQL-Editor**: Inhalt von `supabase/migrations/20261027120000_founders_waitlist.sql` im SQL-Editor des Projekts ausführen.
5. Kontrolle im SQL-Editor:
   ```sql
   select relname, relrowsecurity from pg_class where relname like 'waitlist_%';  -- beide true
   select public.waitlist_confirmed_count();                                        -- 0
   ```
   Unter **Advisors > Security Advisor** dürfen für `waitlist_signups` und `waitlist_rate_limits` keine Warnungen zu RLS stehen.
6. Schlüssel holen: **Project Settings > API Keys**. Gebraucht werden die Projekt-URL (`https://<ref>.supabase.co`) und ein **Secret Key** (`sb_secret_…`, neu anlegen, Name `motivo-worker`). Ein älterer `service_role`-Schlüssel funktioniert auch. Der Schlüssel umgeht RLS: nie in den Browser, nie in ein `NEXT_PUBLIC_*`, nie ins Repo.
7. Hinweis Gratis-Tarif: Supabase pausiert Free-Projekte nach längerer Inaktivität. Ein pausiertes Projekt lässt sich im Dashboard wieder starten; die Website zeigt dann den Zähler nicht an und meldet bei Anmeldungen "Das hat nicht geklappt".

## 2. Resend und Absender-Domain

1. Auf [resend.com](https://resend.com) Konto anlegen (Plan **Free**: 100 Mails pro Tag, 3000 pro Monat). Die Warteliste verschickt höchstens 90 Bestätigungen pro Tag.
2. **Domains > Add Domain**: am besten eine Subdomain der endgültigen Domain, z. B. `mail.<domain>`. Region **eu-west-1 (Ireland)** wählen.
3. Die angezeigten DNS-Einträge (SPF, DKIM, optional DMARC) beim Domain-Anbieter eintragen und in Resend **Verify** drücken, bis der Status "Verified" ist.
4. In den Einstellungen der Domain **Open Tracking und Click Tracking ausschalten** (Datenschutzerklärung verspricht: keine Zählpixel, keine umgeleiteten Links).
5. **API Keys > Create API Key**: Name `motivo-worker`, Berechtigung **Sending access**, nur für diese Domain. Den Schlüssel sofort sichern, er wird nur einmal angezeigt.
6. Absender festlegen, z. B. `Motivo <warteliste@mail.<domain>>`.
7. Auftragsverarbeitungsvertrag (DPA) von Resend und Supabase abschliessen bzw. akzeptieren (beide bieten ihn im Dashboard oder auf der Website an).

## 3. Cloudflare Turnstile (empfohlen)

1. Cloudflare-Dashboard > **Turnstile > Add widget**: Name `motivo-waitlist`, Hostnamen: Produktions-Domain und `motivo-web.andreas-65d.workers.dev`, Modus **Managed**.
2. **Site Key** und **Secret Key** notieren.
3. Beide Schlüssel gehören zusammen. Ist nur einer gesetzt, bleibt die Warteliste aus. Ohne Turnstile funktioniert die Warteliste auch (Honeypot und Rate-Limit schützen dann allein), aber Worker-Previews würden dann ebenfalls Anmeldungen annehmen, weil sie die Secrets der Produktion teilen. Mit Turnstile bleiben Previews aus.

## 4. Secrets und Variablen setzen

**Worker-Secrets** (Laufzeit, verschlüsselt bei Cloudflare), im Ordner `apps/web`:

```bash
npx wrangler secret put SUPABASE_URL                 # https://<ref>.supabase.co
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY    # sb_secret_…
npx wrangler secret put RESEND_API_KEY               # re_…
npx wrangler secret put WAITLIST_FROM_EMAIL          # Motivo <warteliste@mail.<domain>>
npx wrangler secret put TURNSTILE_SECRET_KEY         # nur mit Turnstile
```

Jeder Befehl fragt den Wert ab, er landet nicht in der Shell-History. Kontrolle: `npx wrangler secret list` (zeigt nur Namen).

**GitHub-Repository-Variablen** (Build, öffentlich), unter Settings > Secrets and variables > Actions > **Variables**:

| Variable | Wert |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site Key aus Schritt 3 (nur mit Turnstile) |
| `NEXT_PUBLIC_SITE_URL` | erst wenn die Domain feststeht; bestimmt die Links in den Mails (sonst workers.dev) |

`deploy.yml` übergibt den Site-Key nur beim Produktions-Build (Push auf `main`). Danach einmal neu deployen (Push auf `main` oder Workflow erneut ausführen), damit CSP und Formular den Site-Key kennen. Die Secrets wirken sofort, ohne neuen Build.

## 5. Test in der Produktion

1. Startseite öffnen: Der Abschnitt "Founders-Warteliste" zeigt "0 von 300 Founders-Plätzen vorgemerkt" und das Formular.
2. Mit einer eigenen Adresse eintragen. Die Mail kommt innerhalb einer Minute; Absender, Sprache, Links und Abmeldelink prüfen.
3. Bestätigungslink öffnen: Seite "Du bist auf der Warteliste". Nach spätestens 60 Sekunden zeigt der Zähler 1.
4. Abmeldelink in der Mail öffnen und "Jetzt abmelden" drücken. Im Supabase-Table-Editor ist die Adresse danach leer (`email` = null).
5. Bei Problemen: Cloudflare-Dashboard > Workers > motivo-web > **Logs**. Die Logs enthalten nur Dienst und HTTP-Status (z. B. `waitlist: confirmation mail failed: resend request failed (HTTP 403)`), nie Adressen.

## Lokal entwickeln (optional)

- `apps/web/.env.example` nach `apps/web/.env.local` kopieren und ausfüllen; `pnpm build && pnpm start` nutzt sie. `next dev` schaltet Turnstile immer ab, darum dort `TURNSTILE_SECRET_KEY` leer lassen.
- Mit lokalem Supabase-Stack (Docker): `npx supabase start`, dann `SUPABASE_URL=http://127.0.0.1:54321` und den lokalen Secret Key. In `wrangler`/`cf:preview` ist ein lokales Supabase nicht erreichbar (`global_fetch_strictly_public` in `wrangler.jsonc`).
- Ohne Supabase: `pnpm test` prüft Migration, RLS und den ganzen Ablauf gegen PGlite.

## Vor dem Launch noch offen

- Texte der Warteliste, der Mail und den Abschnitt "Founders-Warteliste" der Datenschutzerklärung juristisch prüfen lassen (im Code als "juristisch zu prüfen" markiert). Bei inhaltlicher Änderung des Einwilligungstexts `WAITLIST_CONSENT_VERSION` in `apps/web/lib/waitlist/constants.ts` erhöhen.
- Betreiberangaben in `apps/web/lib/legal/config.ts` ausfüllen; sie erscheinen auch in der Fusszeile der Mail.
- Prüfen, ob Turnstile im eigenen Frame Cookies setzt, und die Datenschutzerklärung (Abschnitt "Keine Cookies") bei Bedarf ergänzen.

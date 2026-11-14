# Fangbuch

Web-App fürs Angeln: Session starten mit GPS, Fänge per Sprache melden, Live-Wetter automatisch, Karte mit allen Spots, Auswertung und Excel-Export. Läuft auf dem Android-Handy wie eine App (auch offline am Wasser) und gleicht die Daten über Supabase mit allen Geräten ab.

## Was die App macht

- **Session starten:** Holt den Standort, erkennt bekannte Spots (bis 30 m Abstand) oder legt einen neuen an und speichert das Wetter beim Start.
- **Fang oder Biss melden:** Sprechen oder tippen, „Felder ausfüllen“ erkennt Fischart, Länge, Köder, Größe, Gewicht, Setup, Tempo, Wassertemperatur und Verbleib. Beim Speichern kommen Standort, Wetter (Luft, Luftdruck mit Tendenz über 3 h und 24 h, Wind, Böen, Bewölkung, Niederschlag), Sonnenuntergang, Lichtphase und Mond dazu.
- **Offline:** Ohne Netz wird alles auf dem Handy gespeichert. Sobald wieder Netz da ist, werden die Einträge hochgeladen und das fehlende Wetter wird nachgetragen.
- **Karte:** OpenStreetMap mit allen Spots, Punktgröße = Anzahl Fische, Farbe = Durchschnittslänge, Filter nach Land und Fischart.
- **Auswertung:** Kennzahlen (Fische pro Stunde, Landequote) und Tabellen nach Lichtphase, Setup, Köder, Farbe, Montage, Tempo, Luftdruck-Tendenz, Mondphase, Abschnitt und Monat.
- **Fangbuch:** Alle Einträge, zum Bearbeiten antippen, Excel-Export.

Wetterdaten: [Open-Meteo](https://open-meteo.com) (kostenlos, ohne Schlüssel, für private Nutzung). Karte: © OpenStreetMap-Mitwirkende.

## Einrichtung

### 1. Supabase (Datenbank und Anmeldung)

1. Auf [supabase.com](https://supabase.com) ein kostenloses Konto anlegen und **New project** wählen. Region: **Central EU (Frankfurt)**. Das Datenbank-Passwort brauchst du für die App nicht.
2. Links **SQL Editor** → **New query** → den Inhalt von `supabase/schema.sql` einfügen → **Run**.
3. **Authentication → URL Configuration:** Bei **Site URL** die Adresse der App eintragen, z. B. `https://hirschhille-dot.github.io/fangbuch/`.
4. **Project Settings → API:** die **Project URL** und den **Publishable key** (`sb_publishable_…`) kopieren und in `config.js` eintragen. Der Publishable key darf öffentlich sein, den Secret key niemals eintragen, die Datenbankregeln lassen nur dich an deine Daten.

### 2. GitHub Pages (Hosting)

1. Im Repository **Settings → Pages** öffnen.
2. Bei **Source** „Deploy from a branch“, Branch **main**, Ordner **/ (root)** wählen und speichern.
3. Nach 1–2 Minuten ist die App unter `https://hirschhille-dot.github.io/fangbuch/` erreichbar.

### 3. Auf dem Android-Handy

1. Die Adresse in **Chrome** öffnen.
2. Menü (drei Punkte) → **App installieren** bzw. **Zum Startbildschirm hinzufügen**.
3. App öffnen → **Konto** → **Konto anlegen** → Bestätigungslink in der E-Mail öffnen → anmelden.
4. **Konto → Fänge aus Datei importieren** und die Datei `Fangbuch_Startdaten.json` wählen (bekommst du von Claude, sie liegt bewusst **nicht** im öffentlichen Repo). Das Wetter wird danach automatisch nachgetragen.
5. Beim ersten Start einer Session Standort erlauben, beim ersten Sprechen das Mikrofon.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Oberfläche |
| `core.js` | Sonne/Mond, Sprach-Parser, Wetterabruf, Statistik |
| `app.js` | Speicher, Sync, GPS, Karte, Auswertung, Export |
| `config.js` | Supabase-Zugang |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installierbare App, offline nutzbar |
| `supabase/schema.sql` | Tabellen und Zugriffsregeln |

## Datenschutz

Das Repository ist öffentlich, damit GitHub Pages kostenlos läuft. Deshalb liegen hier **keine** Fangdaten oder GPS-Spots. Die Daten liegen nur in Supabase (geschützt durch Anmeldung und Row Level Security) und auf deinem Handy.

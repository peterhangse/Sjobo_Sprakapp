# CONTEXT.md — Sjobo_Sprakapp

**Statisk webbapp för manuell språkgranskning av sjöbo.se-sidor.** Personal
listar kommunens sidor, avmarkerar/symbolerar enonymt vilka som granskats, och
kör en "liga" per förvaltning. Statusen delas i Firestore så alla ser
framsteg i realtid. Live: **sjobo-sprakapp.web.app** (HTTP 200).

## Teknik (verifierat)

- **Zero framework**: ren JavaScript-moduler (ES-moduler) + hash-baserad
  SPA-router. Ingen paketmanager, ingen server på sajten.
- **Firebase Hosting** (~/.firebaserc: `sjobo-sprakapp`) + **Firestore**
  (compat-sdk `firebase@10.13.2` bundle:ed i `sjobo.js`).
- **Ingen byggrad**: `index.html` och `src/*.js` ligger i repo-roten och
  Firebase Hosting publicerar roten (`"public": "."`). Det finns ingen `public/`.

## Struktur

```
index.html                — monolint SPA-shell (all inlogg/HUVUD-övergripande)
src/*.js                  — ES-moduler (viewer, runner, storage-firestore, etc.)
public/ sjobo.js          — distribuerad bundle som viewers använder
data/*.json               — statiska datakorpus: sjobo-sidor (~22k), kommuner,
                            förvaltningar, ligor, vapen-bilder
scripts/                  — hjälpskript (glömmer ej)
bilder/vapen/             — kommunvapen-baner
```

## Data & State

- Statiska `data/*.json` (sjobo-sidor + kommuner/förvaltningar/ligor) ligger
  INTE bara i public/ — `/data/sjobo.json` är inte lootad direkt i webbläsaren
  utan via `src/` + bundling.
- **`doneState`** i localStorage (avancerat granskat/hittas) per användare.
- **Firestore `pageStatus`**: kollektion där varje dokument-ID är
  `base64url({url})` och innehåller delat "vem sa klart" — visar liga-status på
  alla. **Skriv- och läspublik öppen** (medvetet — appen har ingen inloggning),
  men `firestore.rules` validerar nu `url` (måste matcha `https://` utan
  mellanslag, max 2000 tecken) samt längdtak på `clearedAt`/`updatedAt`.
  Klienten (arkivmodalen i `index.html`) renderar dessutom aldrig `url` som
  klickbar länk om den inte börjar med `http(s)://` — javascript:-URL:er i
  redan lagrad data kan alltså inte köra script. Reglerna är emulator-testade
  (12/12, `@firebase/rules-unit-testing`).
- Realtid på dels djup via `onSnapshot()`-lysandet.

## Köra / deploya

Lokal test: t.ex. `python3 -m http.server 8000` + öppna `index.html`.

Deploy-ström: `git push origin main`
→ GitHub Action `.github/workflows/*` sätter `FIREBASE_SERVICE_ACCOUNT_SJOBO_SPRAKAPP`
(secret i GitHub) och kör `firebase deploy --only hosting`. `.fabrik`-rad:
`git add -A && git commit -m 'uppdatering' && git push origin main`.

## Mekanik (viktiga flöden)

1. **Lösenord-spärr** (frontend-only) i `index.html` — skyddar inte data.
2. Välj enhet → förvaltning → filtret på `items`-arrayen.
3. Kort/lista per sida: "Granskad", "Hittas", "Kan ej öppnas" + notes.
4. "Liga" per förvaltning räknat antal klara/granskade av totalen (real-time).
5. **Inställningar**: admin-del för transkriberade-ord/ligor etc.

**Datafält (`items` i JSON):** `{u:sökbar, s:sökmatchare, t:titel, f:forvaltning,
r:rad, k:kategori, a:atomer?, vk/v/p: metadata}` — kolla `.schema` om du ska
skriva nytt. Notera: `sjobo-trasig.json` innehåller bara `items` (ingen
`schema`), resten av JSON-filerna har schema.

## Kontroll och rensning av data (17 okt 2026)

- `data/sjobo.json` prövas mot publicerade sjobo.se med
  `python3 scripts/kontroll/kontrollera_sjobo.py` (`--ny` hämtar om sajten,
  cache och `pages.jsonl` är gitignorerade). Fel som finns kvar ligger kvar,
  flyttade fel får ny adress och sidtitel från sidans `<title>`. Övriga flyttas
  till `data/sjobo-borttagna.json` (med `orsak`) eller `data/sjobo-granska.json`
  (inget förslag, bara metadata, URL-/jämförelsenoteringar). Appen läser inte de
  två filerna. `scripts/kontroll/manuella-bedomningar.json` håller handgjorda
  bedömningar (inte fel / stilförslag) som respekteras vid varje körning.
  `generatedAt` sätts till kontrolltiden.
- `index.html`: `applyDoneStateSnapshot()` ignorerar klarmarkeringar äldre än
  `generatedAt` för sidor som fortfarande finns i datafilen (`arAterOppnad()`),
  så de visas som öppna igen. Firestore ändras inte. Datumet i sidhuvudet sätts
  från `generatedAt` i `init()`.
- Skrapade kommuner (version 2-filer) rensas med
  `python3 scripts/rensa_skrapning.py --alla`: nyheter, evenemang, bläddrings-
  sidor, intranät, dubbletter (http/www, .printable, /link/), mallfel (samma fel
  på ≥10 sidor och ≥3 % av sidorna, sparas i fältet `mallfel`), okända ord utan
  förslag och radbrytningar som lästs som mellanslag tas bort. Tom länktext,
  okända ord och H1 är inte längre akuta. Fältet `rensning` visar vad som
  togs bort. Skriptet går att köra flera gånger och bör köras efter varje ny
  skrapning.
- `src/markera.js` (`markeraSkillnad`) markerar skillnaden mellan felaktig text
  och förslag på ordnivå i felkorten. Ingen markering när förslaget är `–`
  eller en instruktion.
- `data/sjobo-sprakfel|redaktionellt|oklart|trasig.json` är en äldre uppdelning
  av augustidatat och används inte av appen.

## Gotchas (verifierat)

- **`local_granskning.py`** (repo-rot, util) använder `gpt-oss:20b` via Ollama
  för bulkgranskning — refereras som "dold pipeline" i CONTEXT men är INTE i
  repot. Det NÅGON södra version körs externt.
- **Scraper-pipeline för sjobo-sidorna är extern** (inte in-checkad): det som
  här är "from ./scripts sjobo_stavning_v2.py körs utanför repot".
- `.github/src` är TILLFÄLLIGT deployad data (`src/*.js` kopieras ut till
  public/); vill du ändra den färdiga bundlen ska du ändra `src/*.js` och
  bygga bundle via skript (inte spåra `sjobo.js` direkt).
- `firestore.rules` begränsar INTE `pageStatus` skrivning — öppen (medvetet,
  se ovan), men härdad mot XSS-payload och kvotmissbruk via schemavalidering.
  Vill du stänga helt: auth-krav, men appen är lösenord-in-span.

## Viktigt

Skriv bara om `CONTEXT.md` när ändringar gjorts som matchar ovan — annars
ändra inte detta dokument i samma commit som orelaterade ändringar.
# Sjobo_Sprakapp

En statisk HTML/CSS/JS-app för språkrättning av sidor på sjobo.se.

## Köra lokalt

1. Öppna `index.html` i webbläsaren, eller kör en enkel statisk server från repo-roten.
2. Lägg in din Firebase Web App-konfiguration i `index.html` (objektet `FIREBASE_CONFIG`).
3. Se till att Firestore är aktiverat i samma Firebase-projekt.

Exempel med enkel lokal server:

```bash
python -m http.server 8000
```

Öppna sedan `http://localhost:8000`.

## Deploy till Firebase Hosting

1. Installera Firebase CLI:

```bash
npm install -g firebase-tools
```

2. Logga in:

```bash
firebase login
```

3. Koppla projekt:

```bash
firebase use --add
```

4. Deploya Hosting + regler:

```bash
firebase deploy --only hosting,firestore:rules
```

## Hur Firestore-status fungerar

- Appen använder samlingen `pageStatus` för delad sidstatus.
- Dokument-ID är en deterministisk base64url-kodning av sidans URL.
- Dokumentform:

```json
{
  "url": "https://...",
  "status": "cleared" | "open",
  "clearedAt": "ISO-tid eller tom sträng",
  "updatedAt": "ISO-tid"
}
```

- Internt i appen behålls samma struktur:
  - `doneState[url] = ISO timestamp` för sidor med `status === "cleared"`.
- Realtime-listener (`onSnapshot`) uppdaterar alla användare direkt när status ändras.
- `Markera klar → nästa sida`, `Markera som ej klar`, filtrering och export använder samma `doneState`-modell som tidigare.

## Säkerhet och avgränsning

- Firestore-regler tillåter **endast** publik read/write för samlingen `pageStatus`.
- Övriga dokument i databasen nekas (`deny by default`).
- Skrivningar valideras till endast tillåtna fält: `url`, `status`, `clearedAt`, `updatedAt`.

> Varning: oautentiserade skrivningar är medvetet aktiverade i fas 1 enbart för sidstatus-spårning.

## Lösenordsgrind (client-side)

Appen skyddas av en enkel lösenordsgrind i webbläsaren:

- Skyddet är **enbart client-side** och förhindrar casual åtkomst.
- Det är **inte** ett starkt säkerhetsskydd. En teknisk användare kan kringgå det genom att inspektera frontend-koden.
- Källkoden lagrar **endast ett SHA-256-hash** av lösenordet – inte lösenordet i klartext.
- Vid korrekt lösenord sparas ett unlock-flagg i `localStorage` (`sjobo_sprakapp_unlocked`) så att appen förblir upplåst vid framtida besök i samma webbläsare.
- Knappen **Lås** i sidhuvudet rensar flagget och låser appen igen.
- Ingen Firebase Authentication används.

## Rekommenderad uppföljning: App Check

Appen använder ingen inloggning i fas 1. För att minska missbruk bör Firebase App Check aktiveras i nästa steg (t.ex. reCAPTCHA Enterprise för webben) och enforcement slås på för Firestore när klienten uppdaterats.

# Kontroll: stämmer siffrorna i appen med sjobo.se?

Två skript som jämför felen i `data/sjobo.json` med hur sjobo.se faktiskt ser ut
just nu. Fel som har rättats, skrivits om eller vars sida tagits bort försvinner
ur appen. Fel som finns kvar ligger kvar, med ny adress om sidan har flyttat.

Inget LLM behövs, det är ren textjämförelse. Allt körs lokalt.

## Kör (från repo-roten)

```
python3 scripts/kontroll/hamta.py
python3 scripts/kontroll/kontrollera.py
git diff --stat
```

Det första kommandot tar ungefär 15 minuter. Det andra tar några sekunder och
skriver om `data/sjobo.json` och lägger en CSV med status för varje fel i
`scripts/kontroll/`. Ser `git diff --stat` rimligt ut pushar du som vanligt, och
appen visar de nya siffrorna efter deployen.

Kräver Python-paketen `requests` och `beautifulsoup4`.

## Vad händer med sidor som markerats klara?

Statusen i Firestore rörs inte. Men en sida som markerats klar *före* kontrollen
och som fortfarande har fel på sjobo.se visas som öppen igen. Sidor som
markeras klara efter kontrollen räknas som klara fram till nästa kontroll.

## Statusar i CSV-filen

- **Kvar** – felaktig formulering finns ordagrant kvar.
- **Delvis kvar** – meningen är ändrad men minst ett fel finns kvar.
- **Åtgärdat** – föreslagen rättelse finns på sidan.
- **Texten ändrad** – varken gammal eller föreslagen text hittas (räknas som hanterad).
- **Sidan borta** – adressen svarar inte och texten finns inte någon annanstans.
- **Manuell koll** – gäller struktur, metadata eller annan webbplats; ligger kvar i appen.

Stickprov 9 okt 2026: 24 av 25 slumpvis valda "Kvar" bekräftades i sidkällan.

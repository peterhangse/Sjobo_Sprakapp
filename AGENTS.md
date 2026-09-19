# AGENTS.md — Sjobo_Sprakapp

**Läs `CONTEXT.md` först** innan du ändrar något.

## Kontrakt

- Ändrar du struktur, data-schema eller Firestore-flöden: **uppdatera
  `CONTEXT.md` i samma commit**.
- **Statisk app, ingen byggrad**: resultatet du testar är rena ES-moduler i
  `public/`. Distribuerad bundle `public/sjobo.js` genereras från `src/*.js` —
  ändra källan, bygg om, lägg INTE förhand i bundle.
- `data/*.json`-filerna har schema i sig (`items` + metadata); `sjobo-trasig.json`
  har bara `items` — anta aldrig samma form.
- **Firestore `pageStatus` är öppen för skrivning** — håll den liten; lägg
  aldrig personuppgifter där. Firestore-regler är bara frontend-guard, inte
  sekretess.
- Scraper och `local_granskning.py` (Ollama) körs EXTERNT — ta inte bort den
  ersättande pipeline som refereras i CONTEXT.
- OBS: `.github/src` deployar filtrerad data — se till att följa den
  mekanismen.
- Deploy = push till main → Action → `sjobo-sprakapp.web.app`.
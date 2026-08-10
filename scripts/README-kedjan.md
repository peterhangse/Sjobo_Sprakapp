# Hela kedjan: från skrapning till granskning i appen (LOKAL, gratis)

Din pipeline, helt på Bosgame, ingen extern API. Använd sjobo_stavning_v2.py
(den förbättrade: robots.txt, sitemap, dubblettskydd, Excel-export) med lokal
granskning mot din Ollama.

## Flödet

```
1. CRAWLA    python3 sjobo_stavning_v2.py --steg crawla --max-pages 200
             (upprepa tills "Kö kvar: 0"; använder sitemap automatiskt)
2. GRANSKA   python3 sjobo_stavning_v2.py --steg granska
             → issues.jsonl   (nu mot DIN lokala modell, se nedan)
3. BRYGGA    node scripts/brygga.js --in issues.jsonl \
                  --municipality sjobo --name "Sjöbo kommun" \
                  --domain sjobo.se --out data/sjobo.json
4. IMPORTERA appen läser data/sjobo.json (efter inkoppling i index.html)
5. GRANSKA   i appen: arbetslista, prioritet, markera klar
6. RAPPORT   rapport.js → säljbar HTML
```

## Gör granskningen LOKAL (steg 2) — ingen kostnad, full suveränitet

v2 anropar fortfarande Anthropics moln. Byt till din Ollama med patchen i
lokal_granskning_v2.py — tre små ändringar (står i filens topp):

1. Importera: `from lokal_granskning_v2 import proofread_chunk_lokal`
2. Ta bort de fyra ANTHROPIC_API_KEY-raderna i proofread_all()
3. Byt `proofread_chunk(client, chunk)` → `proofread_chunk_lokal(chunk)`

Testa först fristående:
```
python3 lokal_granskning_v2.py
```
Ska hitta felen i testmeningen. Fungerar det → koppla in i scrapern.

Modell: gpt-oss:20b (snabb, bra svenska) som standard. Byt till qwen3-next:80b
i lokal_granskning_v2.py om du vill ha starkare granskning (långsammare).

## Mät mot ditt facit — det viktigaste testet

Du har en manuell granskning (435 sidor, 1663 fel) gjord med web_search +
mänsklig bedömning. Det är ditt FACIT. Kör den lokala automatiska kedjan mot
några av samma sidor och jämför:
- Hittar den lokala modellen samma fel?
- Missar den något du hittade?
- Rapporterar den falska fel?

Det avgör om automatiseringen duger, eller om språkgranskning är en uppgift där
du som människa fortfarande är domaren (P5) och modellen bara föreslår.

## Bryggan hanterar redan v2:s format

v2 skriver issues.jsonl som {url, title, issues:[{felaktig_text, korrigering,
feltyp, kommentar}]}. Bryggan (brygga.js) läser exakt det formatet — inget
behöver ändras. Kedjan passar ihop.

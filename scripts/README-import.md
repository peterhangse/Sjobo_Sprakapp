# Importera en skrapning → dataset

Det här skriptet är kärnan i Fas 1: **byt data utan att röra appens kod.**
Du kör en skrapning, matar den genom skriptet, och får en färdig `data/<kommun>.json`
som appen läser. Vill du uppdatera → ny skrapning, kör om, byt fil. Vill du lägga
till en kommun → samma sak med ett nytt kommunnamn.

## Från JSON

```
node scripts/import-dataset.js \
  --in min-skrapning.json \
  --municipality sjobo \
  --name "Sjöbo kommun" \
  --domain sjobo.se \
  --out data/sjobo.json
```

Infilen kan vara antingen en naken lista av sidor `[ {url, title, errors...}, ... ]`
eller ett objekt `{ "pages": [ ... ] }`.

## Från CSV

En rad per fel. Flera fel på samma URL slås automatiskt ihop till en sida.

```
node scripts/import-dataset.js \
  --in min-skrapning.csv --csv \
  --municipality ystad \
  --name "Ystads kommun" \
  --domain ystad.se \
  --out data/ystad.json
```

Kolumner som känns igen (i valfri ordning):
`url, title, administration, department, type, wrongText, suggestion, comment, priority, acute`

`acute` tolkas som sant vid: true, ja, 1, x.

## Vad du får

En fil med versionsfält (datasetId, generatedAt) och normaliserade sidor.
Skriptet validerar och vägrar skriva om något är trasigt — så du aldrig
råkar deploya ett brutet dataset.

## Nästa steg (kräver dig vid Bosgame)

När vi sett index.html kopplar vi appen till att LÄSA `data/<kommun>.json`
i stället för inbäddad DATA. Då är cirkeln sluten: skrapning → import → filbyte → klart.

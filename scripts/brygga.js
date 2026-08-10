#!/usr/bin/env node
// brygga.js — kopplar din befintliga scraper till appen
//
// Din scraper (sjobo_stavning.py) producerar issues.jsonl:
//   {"url":..., "title":..., "issues":[{felaktig_text, korrigering, feltyp, kommentar}]}
//
// Appen (och alla moduler vi byggt) äter data/<kommun>.json:
//   {datasetId, municipality, generatedAt, pages:[{url,title,errors:[{type,wrongText,suggestion,comment,priority,acute}]}]}
//
// Detta skript är BRYGGAN. Kör din scraper som vanligt, mata sedan issues.jsonl
// hit → få en färdig datafil appen kan läsa. Cirkeln sluts:
//   crawla → granska → BRYGGA → importera → granska i appen → rapport
//
// Användning:
//   node brygga.js --in issues.jsonl --municipality sjobo \
//        --name "Sjöbo kommun" --domain sjobo.se --out data/sjobo.json

'use strict';
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--in') a.in = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--municipality') a.municipality = argv[++i];
    else if (t === '--name') a.name = argv[++i];
    else if (t === '--domain') a.domain = argv[++i];
    else if (t === '--id') a.datasetId = argv[++i];
  }
  return a;
}

// Mappa scraperns feltyp → appens (behåll svenska, appen är svensk)
function mappaFeltyp(feltyp) {
  const f = (feltyp || '').toLowerCase();
  if (f === 'särskrivning') return 'särskrivning';
  if (f === 'stavfel') return 'stavfel';
  if (f === 'grammatik') return 'grammatik';
  return 'annat';
}

// Gissa akut/prioritet ur feltyp. Scrapern sätter inte detta, men vissa
// feltyper är rimligen viktigare. Konservativt: inget är "akut" automatiskt —
// det är en mänsklig bedömning. Vi sätter prioritet som en hjälp.
function prioritetFor(feltyp) {
  const f = (feltyp || '').toLowerCase();
  if (f === 'stavfel' || f === 'särskrivning') return 'medel';
  return 'låg';
}

function main() {
  const a = parseArgs(process.argv);
  if (!a.in || !a.out || !a.municipality) {
    console.error('Användning: node brygga.js --in issues.jsonl --out data/<kommun>.json ' +
      '--municipality <kommun> [--name "Namn"] [--domain domän] [--id datasetId]');
    process.exit(1);
  }
  if (!fs.existsSync(a.in)) {
    console.error('Hittar inte infilen:', a.in); process.exit(1);
  }

  const rader = fs.readFileSync(a.in, 'utf-8').split('\n')
    .map(r => r.trim()).filter(Boolean);

  const pages = [];
  let totalaFel = 0;
  let hoppadeRader = 0;

  for (const rad of rader) {
    let obj;
    try { obj = JSON.parse(rad); }
    catch (e) { hoppadeRader++; continue; }
    if (!obj.url) { hoppadeRader++; continue; }

    const errors = (obj.issues || []).map(iss => ({
      type: mappaFeltyp(iss.feltyp),
      wrongText: (iss.felaktig_text || '').trim(),
      suggestion: (iss.korrigering || '').trim(),
      comment: (iss.kommentar || '').trim(),
      priority: prioritetFor(iss.feltyp),
      acute: false   // akut = mänsklig bedömning, sätts i appen
    })).filter(e => e.wrongText);

    totalaFel += errors.length;
    pages.push({
      url: obj.url,
      title: (obj.title || '').trim(),
      administration: '',   // scrapern vet inte förvaltning — fylls senare om känt
      errors: errors
    });
  }

  if (!pages.length) {
    console.error('VARNING: inga giltiga sidor i infilen. Är det rätt issues.jsonl?');
    process.exit(1);
  }

  const dataset = {
    datasetId: a.datasetId || (a.municipality + '-' + new Date().toISOString().slice(0, 10)),
    municipality: a.municipality,
    municipalityName: a.name || '',
    sourceDomain: a.domain || '',
    generatedAt: new Date().toISOString(),
    pages: pages
  };

  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  fs.writeFileSync(a.out, JSON.stringify(dataset, null, 2), 'utf-8');

  console.log('KLART: ' + a.out);
  console.log('  datasetId:  ' + dataset.datasetId);
  console.log('  sidor:      ' + pages.length);
  console.log('  fel totalt: ' + totalaFel);
  if (hoppadeRader) console.log('  hoppade rader (trasiga/utan url): ' + hoppadeRader);
  console.log('');
  console.log('Nästa steg: lägg filen där appen läser den, eller kör den genom');
  console.log('import-dataset.js om du vill validera extra. Appen är redo att läsa den.');
}

main();

#!/usr/bin/env node
// import-dataset.js — gör en rå skrapning till en giltig dataset-fil
//
// Kärnan i Fas 1: "importera en ny skrapning utan att röra appens logik."
// Tar en rå JSON (eller CSV via --csv) och skriver en normaliserad
// data/<kommun>.json i det schema appen (och multikommun-stödet) väntar sig.
//
// Användning:
//   node import-dataset.js --in ratt-skrapning.json --municipality sjobo \
//        --name "Sjöbo kommun" --domain sjobo.se --out data/sjobo.json
//
//   node import-dataset.js --in skrapning.csv --csv --municipality ystad \
//        --name "Ystads kommun" --domain ystad.se --out data/ystad.json
//
// Skriptet validerar, normaliserar och stämplar datasetet med versionsfält,
// så att appen kan visa "senast uppdaterad data" och byta dataset med filbyte.

'use strict';
const fs = require('fs');
const path = require('path');

// ── enkel argumentparser ────────────────────────────────────────────
function parseArgs(argv) {
  const a = { csv: false };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--csv') a.csv = true;
    else if (t === '--in') a.in = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--municipality') a.municipality = argv[++i];
    else if (t === '--name') a.name = argv[++i];
    else if (t === '--domain') a.domain = argv[++i];
    else if (t === '--id') a.datasetId = argv[++i];
  }
  return a;
}

function idag() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ── CSV-parser (enkel, hanterar citattecken och radbrytningar i fält) ─
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* hoppa */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Gör CSV-rader till sid-objekt. Väntade kolumner (flexibelt):
// url, title, administration, department, type, wrongText, suggestion,
// comment, priority, acute
// En rad = ett fel. Rader med samma url slås ihop till en sida med flera fel.
function csvTillPages(rows) {
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const idx = namn => head.indexOf(namn);
  const sidor = new Map();
  for (let r = 1; r < rows.length; r++) {
    const rad = rows[r];
    if (!rad.length || !rad[idx('url')]) continue;
    const url = rad[idx('url')].trim();
    if (!sidor.has(url)) {
      sidor.set(url, {
        url,
        title: idx('title') > -1 ? (rad[idx('title')] || '').trim() : '',
        administration: idx('administration') > -1 ? (rad[idx('administration')] || '').trim() : '',
        department: idx('department') > -1 ? (rad[idx('department')] || '').trim() : '',
        errors: []
      });
    }
    const fel = { type: '', wrongText: '' };
    if (idx('type') > -1) fel.type = (rad[idx('type')] || '').trim();
    if (idx('wrongtext') > -1) fel.wrongText = (rad[idx('wrongtext')] || '').trim();
    if (idx('suggestion') > -1) fel.suggestion = (rad[idx('suggestion')] || '').trim();
    if (idx('comment') > -1) fel.comment = (rad[idx('comment')] || '').trim();
    if (idx('priority') > -1) fel.priority = (rad[idx('priority')] || '').trim();
    if (idx('acute') > -1) {
      const v = (rad[idx('acute')] || '').trim().toLowerCase();
      fel.acute = (v === 'true' || v === 'ja' || v === '1' || v === 'x');
    }
    if (fel.wrongText) sidor.get(url).errors.push(fel);
  }
  return Array.from(sidor.values());
}

// ── normalisera pages (oavsett källa) ───────────────────────────────
function normaliseraPages(pages) {
  if (!Array.isArray(pages)) return [];
  return pages.map(p => ({
    url: String(p.url || '').trim(),
    title: p.title ? String(p.title).trim() : '',
    administration: p.administration ? String(p.administration).trim() : '',
    department: p.department ? String(p.department).trim() : '',
    errors: Array.isArray(p.errors) ? p.errors.map(e => ({
      type: e.type ? String(e.type).trim() : '',
      wrongText: e.wrongText ? String(e.wrongText).trim() : '',
      suggestion: e.suggestion ? String(e.suggestion).trim() : '',
      comment: e.comment ? String(e.comment).trim() : '',
      priority: e.priority ? String(e.priority).trim() : '',
      acute: e.acute === true
    })) : []
  })).filter(p => p.url);
}

// ── validering ──────────────────────────────────────────────────────
function validera(dataset) {
  const fel = [];
  if (!dataset.datasetId) fel.push('datasetId saknas');
  if (!dataset.municipality) fel.push('municipality saknas');
  if (!dataset.generatedAt) fel.push('generatedAt saknas');
  if (!Array.isArray(dataset.pages)) fel.push('pages är inte en lista');
  else {
    const utanUrl = dataset.pages.filter(p => !p.url).length;
    if (utanUrl) fel.push(utanUrl + ' sidor saknar url');
    const dubbletter = dataset.pages.length - new Set(dataset.pages.map(p => p.url)).size;
    if (dubbletter) fel.push(dubbletter + ' dubbletter av url');
  }
  return fel;
}

// ── huvudflöde ──────────────────────────────────────────────────────
function main() {
  const a = parseArgs(process.argv);
  if (!a.in || !a.out || !a.municipality) {
    console.error('Användning: node import-dataset.js --in <fil> --out <fil> ' +
      '--municipality <kommun> [--name "Namn"] [--domain domän] [--csv] [--id datasetId]');
    process.exit(1);
  }
  if (!fs.existsSync(a.in)) {
    console.error('Hittar inte infilen:', a.in); process.exit(1);
  }

  const rå = fs.readFileSync(a.in, 'utf-8');
  let pages;
  if (a.csv) {
    pages = csvTillPages(parseCsv(rå));
  } else {
    let data;
    try { data = JSON.parse(rå); }
    catch (e) { console.error('Ogiltig JSON i infilen:', e.message); process.exit(1); }
    // acceptera både {pages:[...]} och en naken array
    pages = Array.isArray(data) ? data : (data.pages || []);
  }

  pages = normaliseraPages(pages);

  if (!pages.length) {
    console.error('VARNING: inga giltiga sidor hittades i infilen.');
    console.error('  Kontrollera att varje sida har en "url", och för CSV att');
    console.error('  det finns en url-kolumn med värden.');
    process.exit(1);
  }

  const dataset = {
    datasetId: a.datasetId || (a.municipality + '-' + idag()),
    municipality: a.municipality,
    municipalityName: a.name || '',
    sourceDomain: a.domain || '',
    generatedAt: new Date().toISOString(),
    pages: pages
  };

  const fel = validera(dataset);
  if (fel.length) {
    console.error('VALIDERINGSFEL:');
    fel.forEach(f => console.error('  - ' + f));
    process.exit(1);
  }

  // se till att målmappen finns
  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  fs.writeFileSync(a.out, JSON.stringify(dataset, null, 2), 'utf-8');

  // sammanfattning
  const totFel = pages.reduce((s, p) => s + p.errors.length, 0);
  const akuta = pages.reduce((s, p) => s + p.errors.filter(e => e.acute).length, 0);
  console.log('KLART: ' + a.out);
  console.log('  datasetId:   ' + dataset.datasetId);
  console.log('  kommun:      ' + dataset.municipality + (a.name ? ' (' + a.name + ')' : ''));
  console.log('  sidor:       ' + pages.length);
  console.log('  fel totalt:  ' + totFel + ' (varav ' + akuta + ' akuta)');
}

main();

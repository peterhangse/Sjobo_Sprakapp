/* rapport.js — fristående HTML-rapport
 *
 * ANPASSAD till Sjöbo Språkapps riktiga format (2026-08-09).
 * Producerar en komplett HTML-sträng utan externa beroenden — den kan sparas,
 * mejlas eller skrivas ut som PDF. Det är den här som är produkten kunden
 * betalar för, så den ska tåla att läsas av en kommunchef.
 */

var RAPPORT_PRIO = { 1: "hög", 2: "medel", 3: "låg" };

/** Escapar HTML. All datatext går genom denna — språkfelen innehåller < och &. */
function esc(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svensktDatum(iso) {
  var d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  var tva = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + tva(d.getMonth() + 1) + "-" + tva(d.getDate());
}

function sammanfatta(pages, doneState) {
  var s = {
    sidor: (pages || []).length,
    klara: 0, oppna: 0, akutaSidor: 0,
    felTotalt: 0, felKvar: 0, typer: {}
  };
  (pages || []).forEach(function (p) {
    var klar = !!(doneState && doneState[p.url]);
    s.felTotalt += p.total || 0;
    if (klar) { s.klara += 1; return; }
    s.oppna += 1;
    s.felKvar += p.total || 0;
    if (p.hasAkut) s.akutaSidor += 1;
    (p.errors || []).forEach(function (e) {
      var t = e.t || "okänd";
      s.typer[t] = (s.typer[t] || 0) + 1;
    });
  });
  return s;
}

function _sorteradeSidor(pages, doneState) {
  return (pages || [])
    .filter(function (p) { return !(doneState && doneState[p.url]); })
    .slice()
    .sort(function (a, b) {
      if (a.hasAkut !== b.hasAkut) return a.hasAkut ? -1 : 1;
      return (b.total || 0) - (a.total || 0);
    });
}

/* Bygger rapporten.
 * valfritt.maxSidor  — begränsa antal sidor i detaljlistan (standard: alla)
 * valfritt.titel     — egen rubrik
 */
function byggRapport(pages, doneState, meta, valfritt) {
  var o = valfritt || {};
  var s = sammanfatta(pages, doneState);
  var kommun = (meta && meta.municipalityName) || "Kommunen";
  var titel = o.titel || ("Språkgranskning – " + kommun);
  var sidor = _sorteradeSidor(pages, doneState);
  if (typeof o.maxSidor === "number") sidor = sidor.slice(0, o.maxSidor);

  var typRader = Object.keys(s.typer)
    .sort(function (a, b) { return s.typer[b] - s.typer[a]; })
    .map(function (t) {
      return "<tr><td>" + esc(t) + "</td><td class='n'>" + s.typer[t] + "</td></tr>";
    }).join("");

  var sidRader = sidor.map(function (p) {
    var fel = (p.errors || []).slice().sort(function (a, b) {
      if (!!b.a !== !!a.a) return (b.a ? 1 : 0) - (a.a ? 1 : 0);
      return (a.p || 3) - (b.p || 3);
    });

    var felRader = fel.map(function (e) {
      return "<tr class='" + (e.a ? "akut" : "") + "'>" +
        "<td>" + esc(e.t || "") + "</td>" +
        "<td class='fel'>" + esc(e.f || "") + "</td>" +
        "<td class='ratt'>" + esc(e.r || "") + "</td>" +
        "<td class='kom'>" + esc(e.k || "") + "</td>" +
        "<td class='n'>" + esc(RAPPORT_PRIO[e.p] || "låg") + (e.a ? " · akut" : "") + "</td>" +
        "</tr>";
    }).join("");

    return "<section class='sida'>" +
      "<h3>" + esc(p.sida || p.url) + (p.hasAkut ? " <span class='markad'>akut</span>" : "") + "</h3>" +
      "<p class='url'><a href='" + esc(p.url) + "'>" + esc(p.url) + "</a></p>" +
      "<p class='meta'>" + (p.total || 0) + " fel" +
        (p.akutCount ? ", varav " + p.akutCount + " akuta" : "") + "</p>" +
      "<table class='fel-tabell'><thead><tr>" +
        "<th>Typ</th><th>Felaktig text</th><th>Förslag</th><th>Kommentar</th><th>Prioritet</th>" +
      "</tr></thead><tbody>" + felRader + "</tbody></table>" +
    "</section>";
  }).join("");

  return "<!DOCTYPE html>\n" +
"<html lang='sv'><head><meta charset='utf-8'>\n" +
"<meta name='viewport' content='width=device-width, initial-scale=1'>\n" +
"<title>" + esc(titel) + "</title>\n" +
"<style>\n" +
":root{--blek:#f6f7f9;--linje:#d6dae0;--text:#1c2126;--dov:#5b6570;--akut:#a4262c}\n" +
"*{box-sizing:border-box}\n" +
"body{margin:0;padding:2rem 1.5rem;font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--text);max-width:60rem;margin-inline:auto}\n" +
"h1{font-size:1.8rem;margin:0 0 .3rem}h2{font-size:1.25rem;margin:2.5rem 0 .8rem;border-bottom:2px solid var(--linje);padding-bottom:.3rem}\n" +
"h3{font-size:1.05rem;margin:0 0 .2rem}\n" +
".ingress{color:var(--dov);margin:0 0 2rem}\n" +
".nyckeltal{display:flex;flex-wrap:wrap;gap:.8rem;list-style:none;padding:0;margin:0}\n" +
".nyckeltal li{flex:1 1 8rem;background:var(--blek);border:1px solid var(--linje);border-radius:6px;padding:.8rem 1rem}\n" +
".nyckeltal .siffra{display:block;font-size:1.7rem;font-weight:700;line-height:1.1}\n" +
".nyckeltal .etikett{font-size:.85rem;color:var(--dov)}\n" +
"table{border-collapse:collapse;width:100%;font-size:.9rem}\n" +
"th,td{border:1px solid var(--linje);padding:.45rem .6rem;text-align:left;vertical-align:top}\n" +
"th{background:var(--blek);font-weight:600}\n" +
"td.n{white-space:nowrap;color:var(--dov)}\n" +
".sida{margin:0 0 2rem;padding:0 0 1rem;border-bottom:1px solid var(--linje)}\n" +
".url{margin:0 0 .2rem;font-size:.82rem;word-break:break-all}\n" +
".url a{color:#1a4d7a}\n" +
".meta{margin:0 0 .6rem;font-size:.85rem;color:var(--dov)}\n" +
".markad{background:var(--akut);color:#fff;font-size:.7rem;padding:.1rem .45rem;border-radius:3px;vertical-align:middle}\n" +
"tr.akut td.fel{border-left:3px solid var(--akut)}\n" +
"td.fel{color:var(--akut)}td.ratt{color:#0b6a3a}td.kom{color:var(--dov);font-size:.85em}\n" +
"footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--linje);font-size:.82rem;color:var(--dov)}\n" +
"@media print{body{padding:0}.sida{break-inside:avoid}}\n" +
"</style></head><body>\n" +
"<h1>" + esc(titel) + "</h1>\n" +
"<p class='ingress'>Granskning av " + esc((meta && meta.sourceDomain) || "webbplatsen") +
  ". Datauttag " + esc(svensktDatum(meta && meta.generatedAt)) +
  ", rapport skapad " + esc(svensktDatum()) + ".</p>\n" +
"<ul class='nyckeltal'>" +
"<li><span class='siffra'>" + s.felKvar + "</span><span class='etikett'>fel kvar att åtgärda</span></li>" +
"<li><span class='siffra'>" + s.oppna + "</span><span class='etikett'>sidor kvar</span></li>" +
"<li><span class='siffra'>" + s.akutaSidor + "</span><span class='etikett'>sidor med akuta fel</span></li>" +
"<li><span class='siffra'>" + s.klara + "</span><span class='etikett'>sidor klara</span></li>" +
"</ul>\n" +
"<h2>Fel per typ</h2>\n" +
"<table><thead><tr><th>Feltyp</th><th>Antal</th></tr></thead><tbody>" +
  (typRader || "<tr><td colspan='2'>Inga fel kvar.</td></tr>") + "</tbody></table>\n" +
"<h2>Sidor att åtgärda</h2>\n" +
(sidRader || "<p>Alla granskade sidor är markerade som klara.</p>") +
"<footer>Rapporten omfattar " + s.sidor + " granskade sidor och " + s.felTotalt +
  " funna fel. Sidor markerade som klara ingår inte i listan ovan.</footer>\n" +
"</body></html>";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    esc: esc,
    sammanfatta: sammanfatta,
    byggRapport: byggRapport
  };
}

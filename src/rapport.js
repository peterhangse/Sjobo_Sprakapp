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


var RAPPORT_CSS = [
":root{--papper:#fff;--black:#12181f;--ink:#1b3a5c;--dov:#61707f;--linje:#dde3ea;",
"--akut:#9d2235;--gron:#0f6b45;--gul:#b06f0a;--ljus:#f4f7fa}",
"*{box-sizing:border-box}",
"body{margin:0;padding:2.5rem 1.25rem 4rem;background:var(--papper);color:var(--black);",
"font:16px/1.55 'Segoe UI',system-ui,-apple-system,sans-serif;max-width:52rem;margin-inline:auto}",
"header{border-bottom:3px solid var(--ink);padding-bottom:1.2rem;margin-bottom:2rem}",
".ogonbryn{margin:0;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--dov);font-weight:600}",
"h1{margin:.15rem 0 .35rem;font-size:2.4rem;line-height:1.05;letter-spacing:-.02em;color:var(--ink)}",
"h2{font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:var(--dov);margin:0 0 .8rem;font-weight:700}",
"h3{font-size:1.35rem;margin:0 0 .2rem;color:var(--ink);letter-spacing:-.01em}",
"h4{font-size:1rem;margin:0 0 .1rem;font-weight:600}",
".dov{color:var(--dov);font-size:.85rem;margin:0}",
".nyckeltal{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:1px;",
"background:var(--linje);border:1px solid var(--linje);margin-bottom:2.5rem}",
".nyckeltal div{background:var(--papper);padding:1rem 1.1rem}",
".nyckeltal b{display:block;font-size:2.1rem;line-height:1;font-variant-numeric:tabular-nums;color:var(--ink)}",
".nyckeltal span{font-size:.78rem;color:var(--dov)}",
".nyckeltal .varning b{color:var(--akut)}",
".sidkarta{margin-bottom:2.5rem}",
".karta-grupp{margin:0 0 .7rem}",
".karta-grupp a{display:block;font-size:.8rem;color:var(--ink);text-decoration:none;margin-bottom:.25rem}",
".karta-grupp a:hover{text-decoration:underline}",
".rutor{display:flex;flex-wrap:wrap;gap:2px}",
".ruta{width:11px;height:11px;display:inline-block;border-radius:1px;background:var(--linje)}",
".ruta.akut{background:var(--akut)}.ruta.manga{background:var(--gul)}",
".ruta.nagra{background:#8fa6bd}.ruta.fa{background:#ccd7e2}",
".teckenforklaring{list-style:none;display:flex;flex-wrap:wrap;gap:1rem;padding:.7rem 0 0;margin:0;",
"font-size:.75rem;color:var(--dov)}",
".teckenforklaring li{display:flex;align-items:center;gap:.35rem}",
"nav{background:var(--ljus);padding:1.2rem 1.4rem;margin-bottom:3rem;border-left:3px solid var(--ink)}",
"nav ul{list-style:none;margin:0;padding:0}",
"nav li{display:flex;justify-content:space-between;gap:1rem;padding:.3rem 0;border-bottom:1px solid var(--linje);flex-wrap:wrap}",
"nav li:last-child{border-bottom:0}",
"nav a{color:var(--ink);font-weight:600;text-decoration:none}nav a:hover{text-decoration:underline}",
".forv{margin:0 0 3.5rem;scroll-margin-top:1rem}",
".forv-sum{margin:0 0 1.4rem;font-size:.85rem;color:var(--dov);border-bottom:2px solid var(--linje);padding-bottom:.6rem}",
".sida{margin:0 0 1.6rem;padding-left:.9rem;border-left:2px solid var(--linje)}",
".sida .url{font-size:.72rem;color:var(--dov);word-break:break-all;text-decoration:none;display:block;margin-bottom:.5rem}",
".sida .url:hover{color:var(--ink);text-decoration:underline}",
".markad{background:var(--akut);color:#fff;font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;",
"padding:.12rem .4rem;border-radius:2px;vertical-align:.15em;font-weight:700}",
".fel-lista{list-style:none;margin:0;padding:0}",
".fel{padding:.4rem 0 .4rem .7rem;border-left:2px solid transparent;margin-bottom:.15rem}",
".fel.ar-akut{border-left-color:var(--akut);background:#fdf4f5}",
".typ{display:inline-block;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;",
"color:var(--dov);margin-bottom:.15rem}",
".par{display:block;font-size:.92rem}",
".fore{color:var(--akut);text-decoration:line-through;text-decoration-thickness:1px}",
".pil{color:var(--dov);margin:0 .45rem}",
".efter{color:var(--gron);font-weight:600}",
".ingen{color:var(--dov);font-style:italic}",
".kom{display:block;font-size:.78rem;color:var(--dov);margin-top:.15rem}",
".topp{font-size:.78rem;margin:0}.topp a{color:var(--dov)}",
".klart{padding:2rem;background:var(--ljus);text-align:center}",
"footer{margin-top:3rem;padding-top:1.2rem;border-top:1px solid var(--linje);font-size:.78rem;color:var(--dov)}",
"@media print{body{padding:0;max-width:none;font-size:11pt}",
"nav,.sidkarta{break-after:page}.sida{break-inside:avoid}.forv{break-before:auto}",
".topp{display:none}a{color:inherit;text-decoration:none}}",
"@media(max-width:34rem){h1{font-size:1.8rem}.nyckeltal b{font-size:1.6rem}}"
].join("");

function _forvNamn(p) {
  var e = (p.errors || [])[0];
  return (e && e.fv) || "Ovrigt";
}

function _grupperaPerForvaltning(pages, doneState) {
  var g = {};
  (pages || []).forEach(function (p) {
    if (doneState && doneState[p.url]) return;
    var namn = _forvNamn(p);
    if (!g[namn]) g[namn] = { namn: namn, sidor: [], fel: 0, akuta: 0 };
    g[namn].sidor.push(p);
    g[namn].fel += p.total || 0;
    g[namn].akuta += p.akutCount || 0;
  });
  return Object.keys(g).sort(function (a, b) { return g[b].fel - g[a].fel; })
    .map(function (k) {
      g[k].sidor.sort(function (a, b) {
        if (a.hasAkut !== b.hasAkut) return a.hasAkut ? -1 : 1;
        return (b.total || 0) - (a.total || 0);
      });
      return g[k];
    });
}

function _id(s) {
  return "f-" + String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* Ett fel som fore -> efter. Saknas rattelse (varde "-") visas kommentaren
 * som atgard i stallet, eftersom en tom hoger sida ser ut som ett fel i rapporten. */
function _felRad(e) {
  var harForslag = e.r && e.r !== "\u2013" && e.r !== "-";
  var hoger = harForslag
    ? "<span class='efter'>" + esc(e.r) + "</span>"
    : "<span class='ingen'>bed\u00f6ms p\u00e5 plats</span>";
  return "<li class='fel" + (e.a ? " ar-akut" : "") + "'>" +
    "<span class='typ'>" + esc(e.t || "") + "</span>" +
    "<span class='par'><span class='fore'>" + esc(e.f || "") + "</span>" +
    "<span class='pil' aria-hidden='true'>\u2192</span>" + hoger + "</span>" +
    (e.k ? "<span class='kom'>" + esc(e.k) + "</span>" : "") +
    "</li>";
}

function _sidkarta(grupper) {
  var block = grupper.map(function (g) {
    var rutor = g.sidor.map(function (p) {
      var niva = p.hasAkut ? "akut" : (p.total >= 10 ? "manga" : (p.total >= 4 ? "nagra" : "fa"));
      return "<i class='ruta " + niva + "' title='" + esc(p.sida || p.url) +
             " \u2014 " + (p.total || 0) + " fel'></i>";
    }).join("");
    return "<div class='karta-grupp'><a href='#" + _id(g.namn) + "'>" +
           esc(g.namn) + "</a><div class='rutor'>" + rutor + "</div></div>";
  }).join("");
  return "<section class='sidkarta'><h2>Arbetets omfattning</h2>" +
    "<p class='dov'>Varje ruta \u00e4r en sida. R\u00f6d ruta betyder akut fel.</p>" +
    block +
    "<ul class='teckenforklaring'>" +
    "<li><i class='ruta akut'></i>akut</li>" +
    "<li><i class='ruta manga'></i>10+ fel</li>" +
    "<li><i class='ruta nagra'></i>4\u20139 fel</li>" +
    "<li><i class='ruta fa'></i>1\u20133 fel</li></ul></section>";
}

function byggRapport(pages, doneState, meta, valfritt) {
  var o = valfritt || {};
  var s = sammanfatta(pages, doneState);
  var kommun = (meta && meta.municipalityName) || "Kommunen";
  var titel = o.titel || ("Spr\u00e5kgranskning \u2014 " + kommun);
  var grupper = _grupperaPerForvaltning(pages, doneState);
  if (typeof o.maxSidorPerForvaltning === "number") {
    grupper.forEach(function (g) { g.sidor = g.sidor.slice(0, o.maxSidorPerForvaltning); });
  }

  var innehall = grupper.map(function (g) {
    return "<li><a href='#" + _id(g.namn) + "'>" + esc(g.namn) + "</a>" +
      "<span class='dov'>" + g.sidor.length + " sidor \u00b7 " + g.fel + " fel" +
      (g.akuta ? " \u00b7 " + g.akuta + " akuta" : "") + "</span></li>";
  }).join("");

  var avsnitt = grupper.map(function (g) {
    var sidor = g.sidor.map(function (p) {
      var fel = (p.errors || []).slice().sort(function (a, b) {
        if (!!b.a !== !!a.a) return (b.a ? 1 : 0) - (a.a ? 1 : 0);
        return (a.p || 3) - (b.p || 3);
      });
      return "<article class='sida'>" +
        "<h4>" + esc(p.sida || p.url) +
          (p.hasAkut ? " <span class='markad'>akut</span>" : "") + "</h4>" +
        "<a class='url' href='" + esc(p.url) + "'>" + esc(p.url) + "</a>" +
        "<ol class='fel-lista'>" + fel.map(_felRad).join("") + "</ol>" +
      "</article>";
    }).join("");
    return "<section class='forv' id='" + _id(g.namn) + "'>" +
      "<h3>" + esc(g.namn) + "</h3>" +
      "<p class='forv-sum'>" + g.sidor.length + " sidor \u00b7 " + g.fel + " fel" +
        (g.akuta ? " \u00b7 <strong>" + g.akuta + " akuta</strong>" : "") + "</p>" +
      sidor + "<p class='topp'><a href='#innehall'>Till inneh\u00e5llet</a></p></section>";
  }).join("");

  return "<!DOCTYPE html>\n<html lang='sv'><head><meta charset='utf-8'>\n" +
"<meta name='viewport' content='width=device-width,initial-scale=1'>\n" +
"<title>" + esc(titel) + "</title>\n<style>\n" + RAPPORT_CSS + "</style></head><body>\n" +
"<header>\n<p class='ogonbryn'>Spr\u00e5kgranskning</p>\n<h1>" + esc(kommun) + "</h1>\n" +
"<p class='dov'>" + esc((meta && meta.sourceDomain) || "webbplatsen") +
  " \u00b7 datauttag " + esc(svensktDatum(meta && meta.generatedAt)) +
  " \u00b7 rapport " + esc(svensktDatum()) + "</p>\n</header>\n" +
"<section class='nyckeltal'>" +
"<div><b>" + s.felKvar + "</b><span>fel att \u00e5tg\u00e4rda</span></div>" +
"<div><b>" + s.oppna + "</b><span>sidor ber\u00f6rda</span></div>" +
"<div class='varning'><b>" + s.akutaSidor + "</b><span>sidor med akuta fel</span></div>" +
"<div><b>" + s.klara + "</b><span>sidor redan klara</span></div>" +
"</section>\n" +
(grupper.length ? _sidkarta(grupper) : "") +
"<nav id='innehall'><h2>Inneh\u00e5ll</h2><ul>" + innehall + "</ul></nav>\n" +
(avsnitt || "<p class='klart'>Alla granskade sidor \u00e4r markerade som klara.</p>") +
"<footer>Underlaget omfattar " + s.sidor + " granskade sidor och " + s.felTotalt +
  " funna fel. Sidor markerade som klara ing\u00e5r inte i listorna ovan.</footer>\n" +
"</body></html>";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    esc: esc,
    sammanfatta: sammanfatta,
    byggRapport: byggRapport
  };
}

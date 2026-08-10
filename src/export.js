/* export.js — CSV och JSON
 *
 * ANPASSAD till Sjöbo Språkapps riktiga format (2026-08-09).
 * En rad per FEL (inte per sida) — det är det format en redaktör kan arbeta i.
 */

/* Citerar ett CSV-fält enligt RFC 4180: dubbla citattecken inuti fördubblas,
 * och fältet omges alltid av citattecken. Nödvändigt eftersom språkfelen
 * innehåller komman, citattecken och radbrytningar.
 */
function csvFalt(v) {
  var s = v === null || v === undefined ? "" : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

var CSV_RUBRIKER = [
  "URL", "Sida", "Förvaltning", "Verksamhet", "Feltyp",
  "Felaktig text", "Förslag", "Kommentar", "Prioritet", "Akut", "Sidan klar"
];

var PRIO = { 1: "hög", 2: "medel", 3: "låg" };

/* Bygger CSV. Inleds med BOM så att Excel öppnar å ä ö korrekt —
 * utan den blir svensk text obegriplig i Excel på Windows.
 */
function tillCsv(pages, doneState, taMedKlara) {
  var rader = [CSV_RUBRIKER.map(csvFalt).join(";")];

  (pages || []).forEach(function (p) {
    var klar = !!(doneState && doneState[p.url]);
    if (klar && !taMedKlara) return;

    (p.errors || []).forEach(function (e) {
      rader.push([
        p.url,
        p.sida || "",
        e.fv || "",
        e.vk || "",
        e.t || "",
        e.f || "",
        e.r || "",
        e.k || "",
        PRIO[e.p] || "låg",
        e.a ? "ja" : "nej",
        klar ? "ja" : "nej"
      ].map(csvFalt).join(";"));
    });
  });

  return "\uFEFF" + rader.join("\r\n");
}

/** Fullständig JSON-export: dataset, status och sammanfattning. */
function tillJson(pages, doneState, meta) {
  var oppna = 0, akuta = 0, felKvar = 0, felTotalt = 0;

  (pages || []).forEach(function (p) {
    felTotalt += p.total || 0;
    if (!(doneState && doneState[p.url])) {
      oppna += 1;
      felKvar += p.total || 0;
      if (p.hasAkut) akuta += 1;
    }
  });

  return {
    exporteradAt: new Date().toISOString(),
    dataset: meta || null,
    sammanfattning: {
      antalSidor: (pages || []).length,
      oppnaSidor: oppna,
      klaraSidor: (pages || []).length - oppna,
      oppnaAkutaSidor: akuta,
      felTotalt: felTotalt,
      felKvar: felKvar
    },
    sidor: (pages || []).map(function (p) {
      return {
        url: p.url,
        sida: p.sida || "",
        forvaltning: p.fvid || "",
        verksamhet: p.vkid || "",
        antalFel: p.total || 0,
        akuta: p.akutCount || 0,
        klar: !!(doneState && doneState[p.url]),
        klarAt: (doneState && doneState[p.url]) || null,
        fel: (p.errors || []).map(function (e) {
          return {
            typ: e.t || "",
            felaktigText: e.f || "",
            forslag: e.r || "",
            kommentar: e.k || "",
            prioritet: PRIO[e.p] || "låg",
            akut: !!e.a
          };
        })
      };
    })
  };
}

/* Laddar ner en fil i webbläsaren. Fungerar inte i Node — det är meningen,
 * den anropas bara från appen.
 */
function laddaNer(filnamn, innehall, mimetyp) {
  var blob = new Blob([innehall], { type: (mimetyp || "text/plain") + ";charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filnamn;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

/** Filnamn med dagens datum, t.ex. sjobo-sprakfel-2026-08-09.csv */
function filnamnMedDatum(bas, andelse) {
  var d = new Date();
  var tva = function (n) { return String(n).padStart(2, "0"); };
  return bas + "-" + d.getFullYear() + "-" + tva(d.getMonth() + 1) + "-" +
         tva(d.getDate()) + "." + andelse;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    csvFalt: csvFalt,
    CSV_RUBRIKER: CSV_RUBRIKER,
    tillCsv: tillCsv,
    tillJson: tillJson,
    laddaNer: laddaNer,
    filnamnMedDatum: filnamnMedDatum
  };
}

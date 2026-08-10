/* helpers.js — räknare och status
 *
 * ANPASSAD till Sjöbo Språkapps riktiga format (2026-08-09).
 * Arbetar på utdata från appens egen indexData(), dvs objekt av formen:
 *   { url, sida, fvid, vkid, errors[], counts:{1,2,3}, akutCount, total, hasAkut }
 * där varje error har fälten: u s t f r k fv vk p a   (p: 1=högst, a: 1=akut)
 *
 * doneState är appens egen: { [url]: ISO-datumsträng }
 *
 * Inga beroenden. Fungerar både som <script> och som modul.
 */

/** Är sidan markerad som klar? */
function arKlar(doneState, url) {
  return !!(doneState && doneState[url]);
}

/** Antal sidor som ännu inte är klara. */
function raknaOppnaSidor(pages, doneState) {
  if (!Array.isArray(pages)) return 0;
  return pages.filter(function (p) { return !arKlar(doneState, p.url); }).length;
}

/** Antal ej klara sidor som har minst ett akut fel. */
function raknaOppnaAkutaSidor(pages, doneState) {
  if (!Array.isArray(pages)) return 0;
  return pages.filter(function (p) {
    return !arKlar(doneState, p.url) && p.hasAkut;
  }).length;
}

/** Totalt antal fel på ej klara sidor. */
function raknaFelKvar(pages, doneState) {
  if (!Array.isArray(pages)) return 0;
  return pages.reduce(function (summa, p) {
    return arKlar(doneState, p.url) ? summa : summa + (p.total || 0);
  }, 0);
}

/** Andel klara sidor, 0–100 avrundat. Tom lista ger 0. */
function andelKlar(pages, doneState) {
  if (!Array.isArray(pages) || pages.length === 0) return 0;
  var klara = pages.length - raknaOppnaSidor(pages, doneState);
  return Math.round((klara / pages.length) * 100);
}

/** Status per förvaltning. Nyckel = fvid, värde = {sidor, klara, fel, akuta}. */
function statusPerForvaltning(pages, doneState) {
  var ut = {};
  if (!Array.isArray(pages)) return ut;
  pages.forEach(function (p) {
    var id = p.fvid || "okand";
    if (!ut[id]) ut[id] = { sidor: 0, klara: 0, fel: 0, akuta: 0 };
    ut[id].sidor += 1;
    if (arKlar(doneState, p.url)) {
      ut[id].klara += 1;
    } else {
      ut[id].fel += p.total || 0;
      ut[id].akuta += p.akutCount || 0;
    }
  });
  return ut;
}

/** Antal fel per feltyp (t) på ej klara sidor. */
function felPerTyp(pages, doneState) {
  var ut = {};
  if (!Array.isArray(pages)) return ut;
  pages.forEach(function (p) {
    if (arKlar(doneState, p.url)) return;
    (p.errors || []).forEach(function (e) {
      var typ = e.t || "okänd";
      ut[typ] = (ut[typ] || 0) + 1;
    });
  });
  return ut;
}

/* Senast fixade sidor, nyast först.
 * Robust mot URL:er som inte längre finns i datan — de visas med URL som titel
 * i stället för att krascha (krav ur QA-listan).
 */
function senastFixade(pages, doneState, max) {
  if (!doneState) return [];
  var index = {};
  (pages || []).forEach(function (p) { index[p.url] = p; });

  var rader = Object.keys(doneState).map(function (url) {
    var p = index[url];
    return {
      url: url,
      titel: p ? (p.sida || url) : url,
      antalFel: p ? (p.total || 0) : 0,
      finnsIData: !!p,
      klarAt: doneState[url]
    };
  });

  rader.sort(function (a, b) {
    return String(b.klarAt).localeCompare(String(a.klarAt));
  });

  return typeof max === "number" ? rader.slice(0, max) : rader;
}

/** Svensk datum- och tidsformatering. Tål ogiltiga värden. */
function formateraDatum(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  var tva = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + tva(d.getMonth() + 1) + "-" + tva(d.getDate()) +
         " " + tva(d.getHours()) + "." + tva(d.getMinutes());
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    arKlar: arKlar,
    raknaOppnaSidor: raknaOppnaSidor,
    raknaOppnaAkutaSidor: raknaOppnaAkutaSidor,
    raknaFelKvar: raknaFelKvar,
    andelKlar: andelKlar,
    statusPerForvaltning: statusPerForvaltning,
    felPerTyp: felPerTyp,
    senastFixade: senastFixade,
    formateraDatum: formateraDatum
  };
}

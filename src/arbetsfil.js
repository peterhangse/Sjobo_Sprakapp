/* arbetsfil.js — arbetsordning, "nästa sida", sök
 *
 * ANPASSAD till Sjöbo Språkapps riktiga format (2026-08-09).
 * Se helpers.js för objektformen. Kom ihåg: p = 1 är HÖGST prioritet.
 */

var PRIO_NAMN = { 1: "hög", 2: "medel", 3: "låg" };

function _arKlar(doneState, url) {
  return !!(doneState && doneState[url]);
}

/** Högsta prioritet (lägsta p-värde) bland sidans fel. Saknas fel: 3. */
function hogstaPrioritet(page) {
  var fel = (page && page.errors) || [];
  if (fel.length === 0) return 3;
  return fel.reduce(function (min, e) {
    var p = typeof e.p === "number" ? e.p : 3;
    return p < min ? p : min;
  }, 3);
}

/* Arbetsordning: akuta sidor först, sedan högsta prioritet, sedan flest fel.
 * Sorterar en KOPIA — indata rörs inte.
 */
function arbetsordning(pages, doneState, taMedKlara) {
  var lista = (pages || []).slice();
  if (!taMedKlara) {
    lista = lista.filter(function (p) { return !_arKlar(doneState, p.url); });
  }
  return lista.sort(function (a, b) {
    if (a.hasAkut !== b.hasAkut) return a.hasAkut ? -1 : 1;
    var pa = hogstaPrioritet(a), pb = hogstaPrioritet(b);
    if (pa !== pb) return pa - pb;
    if ((b.total || 0) !== (a.total || 0)) return (b.total || 0) - (a.total || 0);
    return String(a.sida || a.url).localeCompare(String(b.sida || b.url), "sv");
  });
}

/** Den sida arbetet bör börja med just nu. null om allt är klart. */
function nastaSida(pages, doneState) {
  var ordnad = arbetsordning(pages, doneState, false);
  return ordnad.length > 0 ? ordnad[0] : null;
}

/** Sidan efter den angivna URL:en i arbetsordningen. Används efter "markera klar". */
function sidanEfter(pages, doneState, nuvarandeUrl) {
  var ordnad = arbetsordning(pages, doneState, false).filter(function (p) {
    return p.url !== nuvarandeUrl;
  });
  return ordnad.length > 0 ? ordnad[0] : null;
}

/* Fritextsök i sidtitel, URL och felens texter (f, r, k, t).
 * Skiftlägesokänsligt. Tom fras ger hela listan i arbetsordning.
 */
function sok(pages, fras, doneState, taMedKlara) {
  var lista = arbetsordning(pages, doneState, taMedKlara);
  var q = String(fras || "").trim().toLowerCase();
  if (!q) return lista;

  return lista.filter(function (p) {
    if (String(p.sida || "").toLowerCase().indexOf(q) !== -1) return true;
    if (String(p.url || "").toLowerCase().indexOf(q) !== -1) return true;
    return (p.errors || []).some(function (e) {
      return ["t", "f", "r", "k"].some(function (falt) {
        return String(e[falt] || "").toLowerCase().indexOf(q) !== -1;
      });
    });
  });
}

/** Filtrera på förvaltning och/eller verksamhet. Tomt värde = alla. */
function filtrera(pages, fvid, vkid) {
  return (pages || []).filter(function (p) {
    if (fvid && p.fvid !== fvid) return false;
    if (vkid && p.vkid !== vkid) return false;
    return true;
  });
}

/** Läsbar prioritetsetikett för ett fel. */
function prioritetsNamn(fel) {
  var p = fel && typeof fel.p === "number" ? fel.p : 3;
  return PRIO_NAMN[p] || "låg";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PRIO_NAMN: PRIO_NAMN,
    hogstaPrioritet: hogstaPrioritet,
    arbetsordning: arbetsordning,
    nastaSida: nastaSida,
    sidanEfter: sidanEfter,
    sok: sok,
    filtrera: filtrera,
    prioritetsNamn: prioritetsNamn
  };
}

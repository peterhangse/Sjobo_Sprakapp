// jamforelse.js — jämför två dataset över tid (planens expansionsavsnitt)
//
// "Förra skrapningen: 312 fel. Nu: 184. Förbättring: -41 %."
// Ett starkt säljargument: kommunen ser sin förbättring svart på vitt.
// Ren logik, testbar. Tar två dataset (gammalt + nytt) → jämförelse.

function summera(dataset) {
  var pages = (dataset && dataset.pages) || [];
  var fel = pages.reduce(function (s, p) {
    return s + ((p.errors && p.errors.length) || 0);
  }, 0);
  var akuta = pages.reduce(function (s, p) {
    return s + ((p.errors || []).filter(function (e) { return e.acute; }).length);
  }, 0);
  return { sidor: pages.length, fel: fel, akuta: akuta };
}

function procentDiff(gammalt, nytt) {
  if (gammalt === 0) return nytt === 0 ? 0 : 100;
  return Math.round(((nytt - gammalt) / gammalt) * 100);
}

/**
 * Jämför två dataset (samma kommun, olika tidpunkter).
 * @param {object} tidigare - äldre dataset
 * @param {object} nuvarande - nyare dataset
 * @returns {object} jämförelse med tal och procent
 */
export function jamfor(tidigare, nuvarande) {
  var g = summera(tidigare);
  var n = summera(nuvarande);
  return {
    tidigare: {
      datasetId: tidigare ? tidigare.datasetId : null,
      generatedAt: tidigare ? tidigare.generatedAt : null,
      sidor: g.sidor, fel: g.fel, akuta: g.akuta
    },
    nuvarande: {
      datasetId: nuvarande ? nuvarande.datasetId : null,
      generatedAt: nuvarande ? nuvarande.generatedAt : null,
      sidor: n.sidor, fel: n.fel, akuta: n.akuta
    },
    forandring: {
      fel: n.fel - g.fel,
      felProcent: procentDiff(g.fel, n.fel),
      akuta: n.akuta - g.akuta,
      akutaProcent: procentDiff(g.akuta, n.akuta)
    }
  };
}

/**
 * Vilka sidor blev bättre, sämre, nya eller borttagna mellan två dataset.
 * Nyckel är url.
 */
export function siddiff(tidigare, nuvarande) {
  var g = {}, n = {};
  ((tidigare && tidigare.pages) || []).forEach(function (p) {
    g[p.url] = (p.errors && p.errors.length) || 0;
  });
  ((nuvarande && nuvarande.pages) || []).forEach(function (p) {
    n[p.url] = (p.errors && p.errors.length) || 0;
  });
  var battre = [], samre = [], nya = [], borttagna = [];
  Object.keys(n).forEach(function (url) {
    if (!(url in g)) { nya.push({ url: url, fel: n[url] }); }
    else if (n[url] < g[url]) { battre.push({ url: url, fran: g[url], till: n[url] }); }
    else if (n[url] > g[url]) { samre.push({ url: url, fran: g[url], till: n[url] }); }
  });
  Object.keys(g).forEach(function (url) {
    if (!(url in n)) { borttagna.push({ url: url, fel: g[url] }); }
  });
  return { battre: battre, samre: samre, nya: nya, borttagna: borttagna };
}

/**
 * En kort svensk sammanfattningstext, färdig att visa.
 * @returns {string} t.ex. "Från 312 till 184 fel — en förbättring på 41 %."
 */
export function sammanfattning(tidigare, nuvarande) {
  var j = jamfor(tidigare, nuvarande);
  var g = j.tidigare.fel, n = j.nuvarande.fel;
  var p = j.forandring.felProcent;
  if (n < g) {
    return 'Från ' + g + ' till ' + n + ' fel — en förbättring på ' +
      Math.abs(p) + ' %.';
  } else if (n > g) {
    return 'Från ' + g + ' till ' + n + ' fel — en ökning på ' + p + ' %.';
  }
  return 'Oförändrat: ' + n + ' fel.';
}

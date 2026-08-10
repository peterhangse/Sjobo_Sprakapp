// kommuner.js — multikommun-stöd (planens Batch 6, ditt mål B)
//
// Bygger på Fas 1:s dataseparering. När DATA ligger i data/<kommun>.json blir
// "flera kommuner" bara "flera filer + en väljare". Denna modul sköter:
//   - vilka kommuner som finns (ett register)
//   - att ladda rätt datafil
//   - att hålla status åtskild per kommun (Firestore-collection per kommun)
//
// Ingen DOM. Rena funktioner + en laddare. Testbar.

/**
 * Kommunregister. Lägg till en kommun = lägg till en rad + en datafil.
 * (Kan senare flyttas till Firestore som tenants/, men börjar som en fil
 * enligt P1 — minimal struktur först.)
 */
export const KOMMUNER = [
  { id: 'sjobo',  namn: 'Sjöbo kommun',  domän: 'sjobo.se',  datafil: 'data/sjobo.json' }
  // { id: 'ystad', namn: 'Ystads kommun', domän: 'ystad.se', datafil: 'data/ystad.json' },
  // { id: 'tomelilla', namn: 'Tomelilla kommun', domän: 'tomelilla.se', datafil: 'data/tomelilla.json' },
];

/**
 * Hitta en kommun i registret.
 */
export function hittaKommun(id) {
  return KOMMUNER.find(function (k) { return k.id === id; }) || null;
}

/**
 * Vilken kommun ska visas? Ordning: URL-parameter (?kommun=), annars den första.
 * Gör multikommun till en fråga om ?kommun=ystad i adressen — inget mer.
 */
export function väljKommun(sokParametrar) {
  var vald = null;
  if (sokParametrar && typeof sokParametrar.get === 'function') {
    vald = sokParametrar.get('kommun');
  }
  if (vald && hittaKommun(vald)) return hittaKommun(vald);
  return KOMMUNER[0] || null;
}

/**
 * Ladda en kommuns dataset (webbläsare, fetch). Returnerar Promise<dataset>.
 * Robust: kastar tydligt fel om filen saknas eller är trasig.
 */
export function laddaDataset(kommun) {
  if (!kommun || !kommun.datafil) {
    return Promise.reject(new Error('Ingen kommun eller datafil angiven'));
  }
  return fetch(kommun.datafil).then(function (svar) {
    if (!svar.ok) {
      throw new Error('Kunde inte ladda ' + kommun.datafil + ' (' + svar.status + ')');
    }
    return svar.json();
  }).then(function (data) {
    if (!data || !Array.isArray(data.pages)) {
      throw new Error('Datafilen ' + kommun.datafil + ' har fel format (saknar pages)');
    }
    return data;
  });
}

/**
 * Firestore-collection för en kommuns status. Varje kommun får sin egen,
 * så statusar aldrig blandas mellan kommuner.
 * Sjöbo behåller 'pageStatus' (bakåtkompatibelt); andra får 'pageStatus_<id>'.
 */
export function statusCollection(kommunId) {
  return kommunId === 'sjobo' ? 'pageStatus' : ('pageStatus_' + kommunId);
}

/**
 * Bygg alternativ för en dataväljare (id + namn), t.ex. för en <select>.
 */
export function kommunAlternativ() {
  return KOMMUNER.map(function (k) { return { id: k.id, namn: k.namn }; });
}

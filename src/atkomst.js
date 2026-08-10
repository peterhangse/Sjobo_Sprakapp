// atkomst.js — åtkomststyrning för manuell fakturering
//
// Din betalmodell: manuell faktura + inloggning. Ingen kortbetalning, ingen
// intern betalningslösning. "Betalning" blir alltså ÅTKOMSTSTYRNING:
//   - varje kund = en tenant med activeUntil
//   - inloggad + aktiv tenant  -> åtkomst
//   - faktura obetald          -> sätt activeUntil i det förflutna -> spärr
//
// Ren logik. Firebase Auth och Firestore-regler gör själva skyddet (se
// firestore.rules.multitenant). Denna modul avgör bara "får den här visas?".

/**
 * Är en tenant aktiv just nu?
 * @param {object} tenant - { plan, activeUntil (ISO), status }
 * @returns {boolean}
 */
export function arAktiv(tenant) {
  if (!tenant) return false;
  if (tenant.status === 'spärrad') return false;
  if (!tenant.activeUntil) return true; // ingen bortre gräns = aktiv
  var slut = new Date(tenant.activeUntil);
  if (isNaN(slut.getTime())) return true;
  return slut.getTime() >= Date.now();
}

/**
 * Hur många dagar kvar av abonnemanget? Negativt = utgånget.
 * @returns {number|null} dagar, eller null om ingen gräns
 */
export function dagarKvar(tenant) {
  if (!tenant || !tenant.activeUntil) return null;
  var slut = new Date(tenant.activeUntil);
  if (isNaN(slut.getTime())) return null;
  return Math.ceil((slut.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Vad ska appen visa för den här tenanten? En enkel grind-beslutsfunktion.
 * @returns {object} { slapp: bool, meddelande: string, varning: bool }
 */
export function atkomstBeslut(tenant) {
  if (!tenant) {
    return { slapp: false, varning: false,
      meddelande: 'Ingen kund kopplad till detta konto. Kontakta leverantören.' };
  }
  if (!arAktiv(tenant)) {
    return { slapp: false, varning: false,
      meddelande: 'Abonnemanget är inte aktivt. Kontakta leverantören för att förnya.' };
  }
  var dagar = dagarKvar(tenant);
  if (dagar !== null && dagar <= 14) {
    return { slapp: true, varning: true,
      meddelande: 'Abonnemanget löper ut om ' + dagar + ' dagar.' };
  }
  return { slapp: true, varning: false, meddelande: '' };
}

/**
 * Paketnivåer (planens tre paket). Rent informativt — styr vad tenant.plan
 * kan vara och vad den ger.
 */
export const PAKET = {
  engang: {
    namn: 'Engångsgranskning',
    beskrivning: 'En skrapning, en rapport, en arbetslista, 30 dagars åtkomst',
    dagar: 30
  },
  ar: {
    namn: 'Årsabonnemang',
    beskrivning: '4 skrapningar/år, dashboard, delad arbetslista, export, rapport',
    dagar: 365
  },
  tjanst: {
    namn: 'Webbkontroll som tjänst',
    beskrivning: 'Månadsvis skrapning, historik, förvaltningsdashboard, support',
    dagar: 365
  }
};

/**
 * Beräkna activeUntil givet startdatum och paket — för när du skapar en tenant
 * manuellt efter att en faktura skickats.
 * @param {string} paketId - 'engang' | 'ar' | 'tjanst'
 * @param {Date} [start] - default nu
 * @returns {string} ISO-tid för activeUntil
 */
export function beraknaActiveUntil(paketId, start) {
  var p = PAKET[paketId];
  var dagar = p ? p.dagar : 30;
  var d = start ? new Date(start) : new Date();
  d.setDate(d.getDate() + dagar);
  return d.toISOString();
}

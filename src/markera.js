/* Markerar exakt vad som skiljer felaktig text från förslaget.
 *
 * Utan markering visas hela meningen i rött och hela förslaget i grönt, och
 * redaktören får själv leta efter skillnaden. Ofta är det ett enda tecken
 * (bindestreck mot tankstreck, ett komma, en bokstav) i en lång mening.
 *
 * Texten delas i ord, mellanrum och skiljetecken. Det som skiljer markeras
 * med <mark> i båda rutorna. Allt escapas här, så resultatet kan läggas
 * direkt i innerHTML. */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Ord (bokstäver/siffror, inklusive å ä ö), mellanrum eller ett enskilt tecken.
  function delar(s) {
    return String(s).match(/[\p{L}\p{N}]+|\s+|[^\p{L}\p{N}\s]/gu) || [];
  }

  // Längsta gemensamma delsekvens på ordnivå. Meningarna är korta, så O(n*m) räcker.
  function lcs(a, b) {
    var n = a.length, m = b.length, i, j;
    var t = [];
    for (i = 0; i <= n; i++) { t.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
      }
    }
    var ia = [], ib = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ia.push(i); ib.push(j); i++; j++; }
      else if (t[i + 1][j] >= t[i][j + 1]) { i++; }
      else { j++; }
    }
    return { a: ia, b: ib };
  }

  function bygg(tok, behall, klass) {
    var ut = "", i = 0, k = 0, buf = "";
    function tom() {
      if (!buf) return;
      // Ett ändrat mellanslag ensamt markeras med en synlig punkt
      var syns = /^\s+$/.test(buf) ? "␣" : esc(buf);
      ut += '<mark class="' + klass + '">' + syns + "</mark>";
      buf = "";
    }
    for (i = 0; i < tok.length; i++) {
      if (k < behall.length && behall[k] === i) { tom(); ut += esc(tok[i]); k++; }
      else { buf += tok[i]; }
    }
    tom();
    return ut;
  }

  /** Returnerar { fel, forslag } som HTML, eller null om förslaget inte är en omskrivning. */
  function markeraSkillnad(fel, forslag) {
    fel = String(fel || ""); forslag = String(forslag || "").trim();
    if (!forslag || forslag === "–" || forslag === "-") return null;
    var a = delar(fel), b = delar(forslag);
    if (a.length * b.length > 250000) return null; // mycket långa texter visas omarkerade
    var gem = lcs(a, b);
    // Har nästan inget gemensamt är förslaget en instruktion, inte en rättelse
    var ord = a.filter(function (x) { return /[\p{L}\p{N}]/u.test(x); }).length || 1;
    var gemOrd = gem.a.filter(function (i) { return /[\p{L}\p{N}]/u.test(a[i]); }).length;
    if (gemOrd / ord < 0.3) return null;
    return { fel: bygg(a, gem.a, "del"), forslag: bygg(b, gem.b, "ins") };
  }

  global.markeraSkillnad = markeraSkillnad;
  if (typeof module !== "undefined" && module.exports) module.exports = { markeraSkillnad: markeraSkillnad };
})(typeof window !== "undefined" ? window : globalThis);

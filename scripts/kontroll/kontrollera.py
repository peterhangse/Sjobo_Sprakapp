"""Steg 2: prövar varje fel i data/sjobo.json mot texten som hamta.py hämtade.

Kör från repo-roten:  python3 scripts/kontroll/kontrollera.py
Skriver om data/sjobo.json så att bara fel som finns kvar på den publicerade
sajten ligger kvar (med ny adress om sidan har flyttat), och sätter nytt
generatedAt. Appen öppnar då automatiskt igen sidor som markerats klara före
kontrollen men som fortfarande har fel. En Excel-vänlig CSV med status för
varje fel hamnar i scripts/kontroll/kontroll_<datum>.csv.
"""
import difflib, json, re
from collections import Counter
import csv, os
from datetime import datetime, timezone

KONSTHALL = "https://www.sjobo.se/uppleva-och-gora/kultur-i-sjobo/sjobo-konsthall.html"
HERE = os.path.dirname(os.path.abspath(__file__))
DATAFIL = os.path.join(HERE, "..", "..", "data", "sjobo.json")
NOTE_PAREN = re.compile(r"\s*\((?:rubrik|brödtext|ingress|mening \d|på undersidan[^)]*|preview[^)]*|i [^)]*avsnitt[^)]*|[^)]*\bvs\b[^)]*|H\d[^)]*|meta[^)]*|sidtitel[^)]*|länktext[^)]*|puff[^)]*|två ställen[^)]*|flera ställen[^)]*|\d+ ställen[^)]*|x\d+)\)", re.I)
QUOTES = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "„": '"', " ": " ", " ": " ", " ": " "})


def norm(s):
    s = (s or "").translate(QUOTES)
    return re.sub(r"\s+", " ", s).strip()


def clean_fragment(s):
    s = norm(s)
    s = re.sub(r"^(\.{3,}|…)\s*", "", s)
    s = re.sub(r"\s*(\.{3,}|…)$", "", s)
    return s.strip(" '\"")


INSTR = re.compile(r"^(Använd|Bestäm|Välj|Strukturera|Konsolidera|Korrigera|Skriv|Ta bort|Överväg|Ändra|Se över|Lägg till|Uppdatera|Samordna|Enhetlig|Förtydliga|Kontrollera|Byt|Slå ihop|Flytta|Gör|Lägg|Komplettera|Dela upp|Förkorta|Ersätt|Formulera)", re.I)


def fragments(wrong, strip_all=False):
    """Delar upp felaktig text i bitar som ska finnas ordagrant på sidan."""
    w = norm(wrong)
    w = NOTE_PAREN.sub("", w)
    if strip_all:
        w = re.sub(r"\s*\([^)]*\)", "", w)
    left = re.split(r"\s+vs\.?\s+", w)[0]  # vid jämförelser: den första (felaktiga) varianten
    parts = [clean_fragment(p) for p in re.split(r"\.{3,}|…", left)]
    return [p for p in parts if len(p) >= 4]


def cores(wrong, right, ctx=22):
    """Kortaste bit runt själva ändringen, i felaktig och rättad form."""
    a, b = norm(wrong), norm(right)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ops = [o for o in sm.get_opcodes() if o[0] != "equal"]
    if not ops:
        return None, None
    i1, i2 = ops[0][1], ops[-1][2]
    j1, j2 = ops[0][3], ops[-1][4]
    s = max(0, i1 - ctx); e = min(len(a), i2 + ctx)
    sb = max(0, j1 - ctx); eb = min(len(b), j2 + ctx)
    # ut till ordgräns
    while s > 0 and a[s - 1] != " ": s -= 1
    while e < len(a) and a[e] != " ": e += 1
    while sb > 0 and b[sb - 1] != " ": sb -= 1
    while eb < len(b) and b[eb] != " ": eb += 1
    return clean_fragment(a[s:e]), clean_fragment(b[sb:eb])


def op_cores(wrong, right, ctx=12):
    """En kärna per separat ändring (så att delvis rättade meningar upptäcks)."""
    a, b = norm(wrong), norm(right)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ops = [list(o[1:]) for o in sm.get_opcodes() if o[0] != "equal"]
    merged = []
    for o in ops:
        if merged and o[0] - merged[-1][1] < 8:
            merged[-1][1] = o[1]; merged[-1][3] = o[3]
        else:
            merged.append(o)
    res = []
    for i1, i2, j1, j2 in merged:
        s_, e_ = max(0, i1 - ctx), min(len(a), i2 + ctx)
        sb, eb = max(0, j1 - ctx), min(len(b), j2 + ctx)
        while s_ > 0 and a[s_ - 1] != " ": s_ -= 1
        while e_ < len(a) and a[e_] != " ": e_ += 1
        while sb > 0 and b[sb - 1] != " ": sb -= 1
        while eb < len(b) and b[eb] != " ": eb += 1
        res.append((a[s_:e_].strip(), b[sb:eb].strip()))
    return res


def raw_text(url):
    import hashlib, html as H, os
    fn = os.path.join(HERE, "rawcache", hashlib.sha1(url.encode()).hexdigest() + ".html")
    if not os.path.exists(fn):
        return ""
    t = open(fn, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    attrs = " ".join(H.unescape(m) for m in re.findall(r'(?:alt|title|content|aria-label)="([^"]*)"', t))
    return norm(attrs)


def kind(row):
    wrong, right = str(row[2] or ""), str(row[3] or "")
    if wrong.startswith("URL:"):
        return "url"
    if wrong.lower().startswith(("meta-keywords", "meta-beskrivning", "metabeskrivning", "meta description", "sidtitel:")):
        return "meta"
    if wrong.startswith(("Sidan finns", "Sidan kunde", "Brödtext")):
        return "notering"
    return "text"


def load_pages():
    pages = {}
    for line in open(os.path.join(HERE, "pages.jsonl"), encoding="utf-8"):
        r = json.loads(line)
        pages[r["url"]] = r
    return pages


def page_text(r):
    return norm((r.get("title") or "") + "\n" + (r.get("desc") or "") + "\n" + (r.get("full") or ""))


def main():
    pages = load_pages()
    by_final = {}
    for r in pages.values():
        if r.get("status") == 200:
            by_final.setdefault(r.get("final_url"), r)
    texts = {u: page_text(r) for u, r in pages.items() if r.get("status") == 200}
    corpus_urls = list(texts)
    corpus = "\u0001".join(texts[u] for u in corpus_urls)
    offsets, pos = [], 0
    for u in corpus_urls:
        offsets.append(pos); pos += len(texts[u]) + 1

    def where(s):
        i = corpus.find(s)
        if i < 0:
            return None
        import bisect
        return corpus_urls[bisect.bisect_right(offsets, i) - 1]

    dataset = json.load(open(DATAFIL, encoding="utf-8"))
    rows = [(i.get("s"), i.get("t"), i.get("f"), i.get("r"), i.get("k"), i.get("u")) for i in dataset["items"]]
    out = []
    for row in rows:
        sida, typ, wrong, right, komm, url = row
        rec = dict(sida=sida, typ=typ, fel=wrong, forslag=right, kommentar=komm, url=url, status="", detalj="", hittad_pa="")
        k = kind(row)
        key = re.sub(r"^https?://(www\.)?sjobo\.se", "https://www.sjobo.se", str(url or ""))
        if key == "https://www.sjobo.se/konsthall":
            key = KONSTHALL
        p = pages.get(key)
        if p is not None:
            url = key
        if re.match(r"https?://(etjanster|kris)\.sjobo\.se", str(url or "")):
            rec.update(status="Manuell koll", detalj="Ligger på en annan webbplats (e-tjänster/krissidan) som inte ingick i hämtningen")
        elif p is None:
            rec.update(status="Ej prövad", detalj="Sidan kom inte med i hämtningen")
        elif p.get("status") != 200 or "felsida" in (p.get("final_url") or "") or (p.get("title") or "").startswith("Felsida"):
            frs = [f for f in fragments(wrong) if len(f) >= 15] if k == "text" else []
            hit = where(frs[0]) if frs and all(where(f) for f in frs) else None
            if hit:
                rec.update(status="Kvar", detalj="Gamla adressen svarar inte, men felet finns kvar på en annan sida", hittad_pa=hit)
            else:
                rec.update(status="Sidan borta", detalj=f"HTTP {p.get('status')} – sidan finns inte längre på den adressen")
        elif k == "url":
            paths = re.findall(r"/[\w\-/åäö]+\.html", str(wrong))
            alive = [pp for pp in paths if pages.get("https://www.sjobo.se" + pp, {}).get("status") == 200]
            rec.update(status="Kvar" if len(alive) == len(paths) and paths else "Åtgärdat",
                       detalj=f"{len(alive)} av {len(paths)} adresser svarar fortfarande")
            if not paths:
                rec.update(status="Manuell koll", detalj="URL-anmärkning utan tydlig adress")
        elif k in ("meta", "notering"):
            rec.update(status="Manuell koll", detalj="Gäller metadata eller en notering, prövas inte automatiskt")
        else:
            own = texts[url] + " \u0001 " + raw_text(url)
            frs = fragments(wrong)
            alt = fragments(wrong, strip_all=True)
            if alt != frs and not all(f in own for f in frs) and alt and all(f in own for f in alt):
                frs = alt
            instr = bool(INSTR.match(str(right or "").strip())) or str(right or "").strip() in ("–", "-", "")
            wc, rc = (None, None)
            if right and right.strip() not in ("–", "-", "") and len(right) < 3 * max(len(wrong), 1):
                wc, rc = cores(" ".join(frs) if len(frs) == 1 else wrong, right)
                if wc and len(wc) < 4:
                    wc = None
            if not frs:
                rec.update(status="Manuell koll", detalj="Felaktig text för kort för automatisk prövning")
            else:
                full_here = all(f in own for f in frs)
                core_here = wc in own if wc else None
                fix_here = rc in own if rc else None
                sub = bool(wc and rc and wc in rc)
                if sub:
                    # rättad form innehåller den felaktiga – leta rättad form först
                    if fix_here:
                        rec.update(status="Åtgärdat", detalj="Rättad formulering finns på sidan")
                    elif full_here:
                        rec.update(status="Kvar", detalj="Felaktig formulering finns kvar")
                    else:
                        rec.update(status="Texten ändrad", detalj="Varken gammal eller föreslagen formulering hittas")
                elif full_here or core_here:
                    rec.update(status="Kvar", detalj="Felaktig formulering finns kvar" if full_here else "Själva felet finns kvar (meningen är delvis omskriven)")
                elif any(len(w) >= 8 and w in own and not (r and w in r) for w, r in (op_cores(" ".join(frs), right) if (right and not instr and len(frs) == 1) else [])):
                    rec.update(status="Delvis kvar", detalj="Meningen är delvis rättad, men minst ett av felen finns kvar")
                elif fix_here:
                    rec.update(status="Åtgärdat", detalj="Rättad formulering finns på sidan")
                else:
                    elsewhere = where(frs[0]) if all(where(f) for f in frs) else None
                    if elsewhere:
                        rec.update(status="Kvar", detalj="Felet hittas på en annan sida", hittad_pa=elsewhere)
                    elif wc and where(wc):
                        rec.update(status="Kvar", detalj="Själva felet hittas på en annan sida", hittad_pa=where(wc))
                    elif rc and where(rc):
                        rec.update(status="Åtgärdat", detalj="Rättad formulering hittas (på undersida)", hittad_pa=where(rc))
                    elif instr:
                        rec.update(status="Manuell koll", detalj="Anmärkningen beskriver ett problem snarare än en exakt formulering")
                    else:
                        rec.update(status="Texten ändrad", detalj="Varken gammal eller föreslagen formulering hittas")
            rec["_frag"] = frs; rec["_wc"] = wc; rec["_rc"] = rc
        out.append(rec)
    skriv_resultat(dataset, out, pages)


KVAR = {"Kvar", "Delvis kvar", "Manuell koll"}


def skriv_resultat(dataset, out, pages):
    nu = datetime.now(timezone.utc)
    nya = []
    for item, rec in zip(dataset["items"], out):
        if rec["status"] not in KVAR:
            continue
        it = dict(item)
        if rec.get("hittad_pa") and rec["hittad_pa"] != it["u"]:
            it["u"] = rec["hittad_pa"]
            titel = pages.get(rec["hittad_pa"], {}).get("title")
            if titel:
                it["s"] = titel
        nya.append(it)
    datum = nu.strftime("%Y-%m-%d")
    csvfil = os.path.join(HERE, f"kontroll_{datum}.csv")
    with open(csvfil, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Sida", "Typ", "Felaktig text", "Förslag", "Status", "Förklaring", "URL", "Hittad på"])
        for r in out:
            w.writerow([r["sida"], r["typ"], r["fel"], r["forslag"], r["status"], r["detalj"], r["url"], r["hittad_pa"]])
    dataset["items"] = nya
    dataset["datasetId"] = f"sjobo-kontroll-{datum}"
    dataset["generatedAt"] = nu.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    with open(DATAFIL, "w", encoding="utf-8") as f:
        f.write(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n")
    c = Counter(r["status"] for r in out)
    print("Status per fel:", dict(c))
    print(f"Kvar i appen: {len(nya)} fel på {len(set(i['u'] for i in nya))} sidor")
    print(f"Detaljer: {csvfil}")
    print("Titta igenom ändringen med:  git diff --stat   innan du pushar.")


if __name__ == "__main__":
    main()

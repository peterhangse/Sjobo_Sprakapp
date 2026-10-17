"""Prövar varje fel i data/sjobo.json mot publicerade sjobo.se och rensar datafilen.

Kör från repo-roten:

    python3 scripts/kontroll/kontrollera_sjobo.py          # använder sparad hämtning om den finns
    python3 scripts/kontroll/kontrollera_sjobo.py --ny     # hämtar om hela sjobo.se först (ca 15 min)

Kräver Python-paketen requests och beautifulsoup4.

Vad som händer med varje fel:
  Finns kvar på sidan          -> ligger kvar i data/sjobo.json
  Finns på en annan adress     -> ligger kvar, med ny adress och sidtitel
  Rättat, hittas inte, sidan   -> flyttas till data/sjobo-borttagna.json med orsak
  borta, dubblett, filinfo,
  manuellt bedömt som inte fel
  Inget förslag, bara metadata,-> flyttas till data/sjobo-granska.json (för en människa)
  URL- eller jämförelsenotering

Sidtitlarna i appen hämtas från sidornas <title>, så anteckningar som "(uppdaterad)"
försvinner. Akutmarkeringen tas bort från fel som bedömts som stilförslag.
En CSV med status för varje fel hamnar i scripts/kontroll/kontroll_<datum>.csv.
"""
import collections, csv, difflib, hashlib, json, os, re, sys, time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, urlunparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "data", "sjobo.json")
GRANSKA = os.path.join(ROOT, "data", "sjobo-granska.json")
BORTTAGNA = os.path.join(ROOT, "data", "sjobo-borttagna.json")
MANUELLA = os.path.join(HERE, "manuella-bedomningar.json")
CACHE = os.path.join(HERE, "cache")
PAGES = os.path.join(HERE, "pages.jsonl")
UA = "Mozilla/5.0 (Sjobo kommun sprakgranskning; kontroll)"
SKIP_EXT = re.compile(r"\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|svg|zip|mp4|mp3|ics|txt|xml|webp)$", re.I)

# ---------------------------------------------------------------- hämtning


def norm_url(u):
    p = urlparse(u)
    if p.scheme not in ("http", "https") or p.netloc not in ("www.sjobo.se", "sjobo.se"):
        return None
    path = p.path or "/"
    if SKIP_EXT.search(path) or path.endswith(".printable") or "/download/" in path or path.startswith("/sitevision/") \
            or "/images/" in path or path.startswith(("/imagedescription", "/checkoutimages", "/mybookmarks")):
        return None
    if not (path == "/" or path.endswith(".html") or path == "/konsthall"):
        return None
    return urlunparse(("https", "www.sjobo.se", path, "", "", ""))


def cache_fil(u):
    return os.path.join(CACHE, hashlib.sha1(u.encode()).hexdigest() + ".html")


def hamta(items):
    import requests
    from bs4 import BeautifulSoup
    os.makedirs(CACHE, exist_ok=True)
    known = [i["u"] for i in items]
    q, seen = collections.deque(), set()
    for u in ["https://www.sjobo.se/"] + known:
        n = norm_url(u)
        if n and n not in seen:
            seen.add(n); q.append(n)
    s = requests.Session(); s.headers["User-Agent"] = UA
    out = open(PAGES, "w", encoding="utf-8")
    n = 0
    while q and n < 4000:
        u = q.popleft()
        try:
            r = s.get(u, timeout=30, allow_redirects=True)
        except Exception as e:
            out.write(json.dumps({"url": u, "status": "error", "error": str(e)}) + "\n"); continue
        n += 1
        html = r.text if "text/html" in r.headers.get("content-type", "") else ""
        open(cache_fil(u), "w", encoding="utf-8").write(html)
        out.write(json.dumps({"url": u, "final_url": r.url, "status": r.status_code}) + "\n"); out.flush()
        if html:
            for a in BeautifulSoup(html, "html.parser").find_all("a", href=True):
                m = norm_url(urljoin(r.url, a["href"]))
                if m and m not in seen:
                    seen.add(m); q.append(m)
        if n % 100 == 0:
            print(f"{n} sidor hämtade, {len(q)} i kö", flush=True)
        time.sleep(0.35)
    print(f"Hämtning klar: {n} sidor", flush=True)

# ---------------------------------------------------------------- tolkning av sidor

QUOTES = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "„": '"', " ": " ", " ": " ", " ": " ",
                        "­": "", "​": ""})
BLOCK = ["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "br", "section", "article", "header", "footer",
         "nav", "ul", "ol", "tr", "dt", "dd", "figcaption", "blockquote", "main", "aside", "table", "form", "label",
         "button", "option"]


def norm(s):
    return re.sub(r"\s+", " ", (s or "").translate(QUOTES)).strip()


def smart_text(node):
    for t in node.find_all(BLOCK):
        t.insert_before(" \n ")
        t.insert_after(" \n ")
    return norm(node.get_text(""))


def tolka(html):
    from bs4 import BeautifulSoup
    s = BeautifulSoup(html, "html.parser")
    titel = norm(s.title.get_text()) if s.title else ""
    titel = re.sub(r"\s+[-–]\s+Sjöbo kommun$", "", titel)
    meta = [titel]
    for m in s.find_all("meta"):
        if (m.get("name") or m.get("property") or "").lower() in ("description", "keywords", "og:description",
                                                                     "og:title", "twitter:description"):
            meta.append(m.get("content", ""))
    for attr in ("alt", "title", "aria-label"):
        for t in s.find_all(attrs={attr: True}):
            meta.append(t[attr])
    for t in s.find_all(["script", "style", "noscript", "template"]):
        t.decompose()
    main = s.find("main")
    return {"titel": titel, "main": smart_text(main) if main else "", "full": smart_text(s.body or s),
            "meta": norm(" | ".join(meta))}


def ladda_sidor():
    sidor, tolkat = {}, {}
    for l in open(PAGES, encoding="utf-8"):
        r = json.loads(l)
        sidor[r["url"]] = r
    for u, r in sidor.items():
        if r.get("status") == 200 and os.path.exists(cache_fil(u)):
            tolkat[u] = tolka(open(cache_fil(u), encoding="utf-8", errors="replace").read())
    return sidor, tolkat

# ---------------------------------------------------------------- sökning av fel

NOTE_PAREN = re.compile(r"\s*\((?:rubrik|brödtext|ingress|intro|mening \d|på undersidan[^)]*|preview[^)]*|i [^)]*avsnitt[^)]*|"
                        r"[^)]*\bvs\b[^)]*|H\d[^)]*|meta[^)]*|sidtitel[^)]*|titel[^)]*|länktext[^)]*|puff[^)]*|"
                        r"två ställen[^)]*|flera ställen[^)]*|\d+ ställen[^)]*|x\d+|× ?\d+|med [^)]*|i [^)]*|på [^)]*|"
                        r"förekommer[^)]*|visas[^)]*|tabell[^)]*|denna sida|samma sida)\)", re.I)


class Bit(str):
    """Text som ska finnas ordagrant, med ordgräns i ändarna utom där den var avkortad med '...'."""
    def __new__(cls, s, oppen_v=False, oppen_h=False):
        o = str.__new__(cls, s)
        v = "" if oppen_v or not re.match(r"\w", s) else r"(?<!\w)"
        h = "" if oppen_h or not re.search(r"\w$", s) else r"(?!\w)"
        o.rx = re.compile(v + re.escape(s) + h)
        return o

    def i(self, text):
        return bool(self.rx.search(text))


def bitar(fel):
    w = NOTE_PAREN.sub("", norm(fel))
    vanster = re.split(r"\s+vs\.?\s+", w)[0]
    delar = re.split(r"\.{3,}|…", vanster)
    ut = []
    for n, p in enumerate(delar):
        p = p.strip(" '\"")
        if len(p) >= 4:
            ut.append(Bit(p, oppen_v=n > 0, oppen_h=n < len(delar) - 1))
    return ut


def karna(fel, ratt, ctx=10):
    a, b = norm(fel), norm(ratt)
    ops = [o for o in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes() if o[0] != "equal"]
    if not ops:
        return None, None
    i1, i2, j1, j2 = ops[0][1], ops[-1][2], ops[0][3], ops[-1][4]
    s, e, sb, eb = max(0, i1 - ctx), min(len(a), i2 + ctx), max(0, j1 - ctx), min(len(b), j2 + ctx)
    while s > 0 and a[s - 1] != " ": s -= 1
    while e < len(a) and a[e] != " ": e += 1
    while sb > 0 and b[sb - 1] != " ": sb -= 1
    while eb < len(b) and b[eb] != " ": eb += 1
    return a[s:e].strip(" .,"), b[sb:eb].strip(" .,")


def www(u):
    return re.sub(r"^https?://(www\.)?sjobo\.se", "https://www.sjobo.se", u)


def lage(item, sidor, tolkat, annan_sok):
    """Returnerar (läge, ny adress eller None)."""
    u, f, r = www(item["u"]), item["f"], item["r"].strip()
    if u == "https://www.sjobo.se/konsthall":
        u = "https://www.sjobo.se/uppleva-och-gora/kultur-i-sjobo/sjobo-konsthall.html"
    if not u.startswith("https://www.sjobo.se"):
        return "annan webbplats", None
    if f.startswith("URL:") or re.search(r"\svs\.?\s", f) or f.lower().startswith(("två parallella", "sidan ", "url")):
        return "notering", None
    frs = bitar(f)
    if not frs:
        return "notering", None
    wc, rc = karna(" ".join(frs), r) if r and r not in ("–", "-") and len(r) < 4 * len(f) else (None, None)
    t = tolkat.get(u)
    if t:
        if all(x.i(t["full"]) for x in frs):
            return "finns", u
        if all(x.i(t["meta"]) for x in frs):
            return "metadata", u
        if all(x.i(t["full"] + " ¤ " + t["meta"]) for x in frs):
            return "finns", u
        if wc and len(wc) >= 6 and Bit(wc).i(t["full"] + " " + t["meta"]):
            return "finns", u
        if rc and len(rc) >= 6 and Bit(rc).i(t["full"] + " " + t["meta"]) and not (wc and wc in rc):
            return "rättat", None
    annan = annan_sok(frs[0]) if len(frs[0]) >= 12 else None
    if annan and all(x.i(tolkat[annan]["full"]) for x in frs):
        return "annan sida", annan
    if t:
        return "hittas inte", None
    st = (sidor.get(u) or {}).get("status", "ej hämtad")
    return f"sidan borta ({st})", None

# ---------------------------------------------------------------- bedömning

FILINFO = re.compile(r"\d+[.,]\d+ ?[kKM]B\b|\bpdf\s*,|öppnas i nytt fönster")
TITEL_NOT = re.compile(r"\s*\((?:uppdaterad|gammal|parallell|huvudsida|notering|nyhet|preview|startsidan)[^)]*\)\s*$", re.I)


def nyckel(i):
    return (www(i["u"]), norm(i["f"]))


def main():
    dataset = json.load(open(DATA, encoding="utf-8"))
    items = dataset["items"]
    if "--ny" in sys.argv or not os.path.exists(PAGES):
        hamta(items)
    sidor, tolkat = ladda_sidor()
    print(f"{len(tolkat)} sidor på sjobo.se att söka i", flush=True)
    korpus = list(tolkat)

    def annan_sok(bit):
        for u in korpus:
            if bit.i(tolkat[u]["main"]):
                return u
        return None

    manuella, inte_stavfel = {}, set()
    if os.path.exists(MANUELLA):
        for b in json.load(open(MANUELLA, encoding="utf-8"))["bedomningar"]:
            manuella[nyckel(b)] = b["bedomning"]
            if b.get("anm") == "inte stavfel":
                inte_stavfel.add(nyckel(b))

    # dubbletter: felaktig text som redan ingår i ett annat fel på samma sida
    def kort(s):
        return re.sub(r"\s+", " ", re.sub(r"\.\.\.|…", "", s)).strip().lower()
    per_sida = collections.defaultdict(list)
    for n, i in enumerate(items):
        per_sida[www(i["u"])].append(n)
    dubbletter = set()
    for idx in per_sida.values():
        for a in idx:
            for b in idx:
                fa, fb = kort(items[a]["f"]), kort(items[b]["f"])
                if a != b and len(fa) >= 6 and fa in fb and (fa != fb or a > b):
                    dubbletter.add(a)

    nu = datetime.now(timezone.utc)
    datum = nu.strftime("%Y-%m-%d")
    behall, granska, bort, rapport = [], [], [], []
    for n, i in enumerate(items):
        l, ny = lage(i, sidor, tolkat, annan_sok)
        man = manuella.get(nyckel(i), "")
        r = i["r"].strip()
        mal, orsak = "behåll", ""
        if l in ("finns", "annan sida"):
            if man == "inte fel":
                mal, orsak = "bort", "bedömt som inte fel"
            elif n in dubbletter:
                mal, orsak = "bort", "dubblett av ett annat fel på samma sida"
            elif FILINFO.search(i["f"]):
                mal, orsak = "bort", "filnamn eller filinfo som Sitevision skriver"
            elif r in ("–", "-", ""):
                mal, orsak = "granska", "inget förslag"
        elif l == "rättat":
            mal, orsak = "bort", "rättat på sjobo.se"
        elif l == "hittas inte":
            mal, orsak = "bort", "texten finns inte på sidan"
        elif l.startswith("sidan borta"):
            mal, orsak = "bort", "sidan finns inte längre"
        elif l == "metadata":
            mal, orsak = "granska", "syns bara i sidtitel, metatext eller alt-text"
        elif l == "notering":
            mal, orsak = "granska", "beskriver ett problem, går inte att söka på"
        # annan webbplats (e-tjänster, kriswebb) går inte att pröva och ligger kvar
        it = {k: v for k, v in i.items()}
        if mal == "behåll":
            if ny:
                it["u"] = ny
                titel = tolkat.get(ny, {}).get("titel")
                it["s"] = titel or TITEL_NOT.sub("", it["s"])
            else:
                it["s"] = TITEL_NOT.sub("", it["s"])
            if man == "stilförslag":
                it["a"] = 0
            if it["t"] == "stavfel" and nyckel(i) in inte_stavfel:
                it["t"] = "annat"  # riktigt fel, men inte ett stavfel
            behall.append(it)
        else:
            it["orsak"] = orsak
            it["kontrollerad"] = datum
            (granska if mal == "granska" else bort).append(it)
        rapport.append([i["s"], i["t"], i["f"], i["r"], l, ny if ny and ny != www(i["u"]) else "",
                        {"behåll": "Ligger kvar", "granska": "Till granskning", "bort": "Borttaget"}[mal], orsak, man, i["u"]])

    # Fel som flyttats till en ny adress kan bli dubbletter av fel som redan låg där
    per_ny = collections.defaultdict(list)
    for n, it in enumerate(behall):
        per_ny[it["u"]].append(n)
    dubb2 = set()
    for idx in per_ny.values():
        for a in idx:
            for b in idx:
                fa, fb = kort(behall[a]["f"]), kort(behall[b]["f"])
                if a != b and len(fa) >= 6 and fa in fb and (fa != fb or a > b):
                    dubb2.add(a)
    for n in sorted(dubb2, reverse=True):
        it = behall.pop(n)
        it["orsak"], it["kontrollerad"] = "dubblett av ett annat fel på samma sida", datum
        bort.append(it)

    # Samma titel för alla fel på samma adress
    titel_for = {}
    for it in behall:
        titel_for.setdefault(it["u"], it["s"])
    for it in behall:
        it["s"] = titel_for[it["u"]]

    def spara_lista(fil, nya, beskrivning):
        gamla = json.load(open(fil, encoding="utf-8"))["items"] if os.path.exists(fil) else []
        sedda = {nyckel(x) for x in nya}
        alla = nya + [x for x in gamla if nyckel(x) not in sedda]
        json.dump({"beskrivning": beskrivning, "uppdaterad": datum, "items": alla},
                  open(fil, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return len(alla)

    ng = spara_lista(GRANSKA, granska, "Anmärkningar som en människa behöver titta på innan de visas i appen: "
                                       "inget konkret förslag, bara i metadata, eller URL- och jämförelsenoteringar.")
    nb = spara_lista(BORTTAGNA, bort, "Fel som plockats bort ur data/sjobo.json vid kontroll mot sjobo.se, med orsak.")
    dataset["items"] = behall
    dataset["datasetId"] = f"sjobo-kontroll-{datum}"
    dataset["generatedAt"] = nu.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    with open(DATA, "w", encoding="utf-8") as f:
        f.write(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + "\n")
    csvfil = os.path.join(HERE, f"kontroll_{datum}.csv")
    with open(csvfil, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Sida", "Typ", "Felaktig text", "Förslag", "Läge på sjobo.se", "Ny adress", "Resultat", "Orsak",
                    "Manuell bedömning", "Adress i appen"])
        w.writerows(rapport)
    c = collections.Counter(x[4].split(" (")[0] for x in rapport)
    print("Läge per fel:", dict(c))
    print(f"Kvar i appen: {len(behall)} fel på {len(set(x['u'] for x in behall))} sidor, "
          f"varav {sum(1 for x in behall if x['a'])} akuta")
    print(f"Till granskning: {len(granska)} (totalt {ng} i {os.path.relpath(GRANSKA, ROOT)})")
    print(f"Borttagna: {len(bort)} (totalt {nb} i {os.path.relpath(BORTTAGNA, ROOT)})")
    print(f"Detaljer: {os.path.relpath(csvfil, ROOT)}")


if __name__ == "__main__":
    main()

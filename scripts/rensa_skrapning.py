"""Rensar en skrapad kommunfil (data/<kommun>.json, version 2) från sådant som inte är fel på riktiga sidor.

Kör från repo-roten, för en eller flera kommuner:

    python3 scripts/rensa_skrapning.py bjuv eslov tomelilla
    python3 scripts/rensa_skrapning.py --alla              # alla filer med version 2

Kan köras på Bosgame direkt efter brygga_db.py, och flera gånger på samma fil.
Ingen nätåtkomst behövs; allt avgörs från datafilen.

Det som tas bort, och varför:
  - Adresser som inte är vanliga sidor: nyheter, evenemang, bläddrings- och filtersidor
    (?page=, ?paged=, ?p=, start=/end=), intranät, anslag/protokoll, utskriftsversioner,
    kortlänkar (/link/<kod>.aspx), sessions-id och samma sida via http/https eller med/utan www.
  - Mallfel: samma fel på minst 10 sidor (och minst 3 % av sidorna). De sitter i sidmallen,
    inte i sidans text, och sparas i stället en gång i fältet "mallfel".
  - Okända ord utan förslag (nästan alltid namn och fackord) och ord med bindestreck kvar i slutet.
  - "Mellanslag före skiljetecken" där mellanslaget är en radbrytning mellan två element.
  - H1-anmärkningar när de gäller minst hälften av sidorna (mallen).
Det som ligger kvar men inte längre är akut:
  - Tom länktext (kontrollen räknar inte bildens alt-text), okända ord med förslag och H1.
"""
import collections, json, os, re, sys
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qsl

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

NYHET = re.compile(r"/(nyheter|nyhetsarkiv|overgripandenyheter|naringslivsnyheter|aktuelltbevab|aktuellt)(/|$)|"
                   r"/nyhetsarkiv-covid-19/|/arkiv/nyhets|/makingofasmartercity/|/fredagsprofilen/|/20\d\d-\d\d-\d\d-", re.I)
EVENEMANG = re.compile(r"/(event|evenemang|evenemangskalender|evenemangsarkiv\w*|evenemangs-arkiv[\w-]*|"
                       r"julkalendrar|julkalendern\d*|naringslivsevenemang)(/|$)|/tidigareutstallningar/", re.I)
LISTA = re.compile(r"/(nyheter|nyhetsarkiv|anslag|navetinsatser|event|evenemangskalender|aktuelltbevab)(\.\d+)?(\.html)?$", re.I)
TEKNISK = re.compile(r"/portletaction/|mailpoet|[?&]mod-|/test-av-|formular-test|e-tjanst-demo|jsessionid", re.I)
LISTPARAM = {"p", "paged", "page", "start", "end", "amount", "s"}


def sidtyp(u):
    p = urlparse(u)
    path, q = p.path, dict(parse_qsl(p.query))
    if TEKNISK.search(u):
        return "teknisk adress"
    if path.endswith(".printable"):
        return "utskriftsversion"
    if re.match(r"^/link/[0-9a-f]{32}\.aspx$", path):
        return "kortlänk"
    if re.search(r"/intranatet(/|\.|$)", path, re.I):
        return "intranät"
    if q and (set(q) & LISTPARAM or any(k.startswith(("page", "sv.")) or "event_categories" in k or "filter" in k for k in q)):
        return "bläddrings- eller filtersida"
    if LISTA.search(path):
        return "bläddrings- eller filtersida"
    if re.search(r"/anslag(/|$)", path, re.I):
        return "anslag/protokoll"
    if EVENEMANG.search(path):
        return "evenemang"
    if NYHET.search(path):
        return "nyhet"
    return "sida"


def nyckel_url(u):
    p = urlparse(u)
    return p.netloc.lower().removeprefix("www."), p.path.lower().removesuffix(".printable").rstrip("/")


def rensa(fil):
    D = json.load(open(fil, encoding="utf-8"))
    if "rensning" in D:
        D["rensning_tidigare"] = D.pop("rensning")
    items = D["items"]
    fore = len(items)
    fore_sidor = len({i["u"] for i in items})
    orsak = collections.Counter()

    # 1. sidtyp och dubbletter
    grupper = collections.defaultdict(set)
    for i in items:
        grupper[nyckel_url(i["u"])].add(i["u"])
    basta = {}
    for g in grupper.values():
        val = sorted(g, key=lambda x: (not x.startswith("https://www."), not x.startswith("https"), len(x)))[0]
        for u in g:
            basta[u] = val
    kvar = []
    for i in items:
        typ = sidtyp(i["u"])
        if typ != "sida":
            orsak[f"sidtyp: {typ}"] += 1
        elif basta[i["u"]] != i["u"]:
            orsak["sidtyp: samma sida via annan adress"] += 1
        else:
            kvar.append(i)
    items = kvar
    sidor = {i["u"] for i in items}
    n_sidor = len(sidor) or 1
    if D.get("rensning_tidigare", {}).get("sidor_bas"):
        n_sidor = D["rensning_tidigare"]["sidor_bas"]  # samma tröskel för mallfel vid varje körning

    # 2. mallfel
    pa = collections.defaultdict(set)
    for i in items:
        pa[(i["t"], i["f"])].add(i["u"])
    mall = {k for k, s in pa.items() if len(s) >= 10 and len(s) >= 0.03 * n_sidor}
    h1 = collections.defaultdict(set)
    for i in items:
        if i["t"] in ("saknar H1", "flera H1"):
            h1[i["t"]].add(i["u"])
    h1_mall = {t for t, s in h1.items() if len(s) >= 0.5 * n_sidor}
    mallfel = {(m["t"], m["f"]): m for m in D.get("mallfel", [])}  # från tidigare körning
    kvar = []
    for i in items:
        k = (i["t"], i["f"])
        if k in mall or i["t"] in h1_mall:
            orsak["mallfel (samma fel på många sidor)"] += 1
            m = mallfel.setdefault(k, {"t": i["t"], "f": i["f"], "k": i["k"], "kat": i.get("kat", ""), "sidor": 0})
            m["sidor"] += 1
            continue
        kvar.append(i)
    items = kvar

    # 3. kontroller som slår fel
    kvar = []
    for i in items:
        t, f = i["t"], i["f"]
        if t == "okänt ord" and not i.get("r"):
            orsak["okänt ord utan förslag"] += 1; continue
        if t == "okänt ord" and re.search(r"[-–]$|^[-–]", f):
            orsak["okänt ord med avstavning"] += 1; continue
        if t == "mellanslag före skiljetecken" and "\n" in f:
            orsak["radbrytning läst som mellanslag"] += 1; continue
        if t == "tom länktext":
            i["a"] = 0
            if "alt-text" not in i["k"]:
                i["k"] = i["k"].rstrip() + " Kontrollera först om länken innehåller en bild med alt-text, då har den ett namn."
        if t == "okänt ord":
            i["a"] = 0
            i["p"] = 3
        if t in ("saknar H1", "flera H1"):
            i["a"] = 0
        kvar.append(i)
    items = kvar

    D["items"] = items
    D["mallfel"] = sorted(mallfel.values(), key=lambda m: -m["sidor"])
    per_kat = collections.Counter(i.get("kat", "") for i in items)
    per_allvar = collections.Counter(str(i.get("p", "")) for i in items)
    D["sammanfattning"] = {"per_kategori": dict(per_kat), "per_allvar": dict(per_allvar),
                           "akuta": sum(1 for i in items if i.get("a")),
                           "lagkrav": sum(1 for i in items if i.get("kat") == "tillganglighet"),
                           "totalt": len(items)}
    D["rensning"] = {"datum": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "fel_fore": fore,
                     "sidor_fore": fore_sidor, "sidor_bas": n_sidor, "fel_efter": len(items), "sidor_efter": len({i["u"] for i in items}),
                     "borttaget": dict(orsak)}
    tidigare = D.get("rensning_tidigare")
    if tidigare:  # körs filen igen behålls siffrorna från första rensningen
        D["rensning"]["fel_fore"], D["rensning"]["sidor_fore"] = tidigare["fel_fore"], tidigare["sidor_fore"]
        D["rensning"]["borttaget"] = dict(collections.Counter(tidigare["borttaget"]) + orsak)
    D.pop("rensning_tidigare", None)
    if not D["datasetId"].endswith("-rensad"):
        D["datasetId"] += "-rensad"
    with open(fil, "w", encoding="utf-8") as fh:
        json.dump(D, fh, ensure_ascii=False, separators=(",", ":"))
    return D["rensning"]


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(1)
    if args == ["--alla"]:
        args = []
        for f in sorted(os.listdir(os.path.join(ROOT, "data"))):
            if f.endswith(".json"):
                try:
                    if json.load(open(os.path.join(ROOT, "data", f), encoding="utf-8")).get("version") == 2:
                        args.append(f[:-5])
                except Exception:
                    pass
    for k in args:
        r = rensa(os.path.join(ROOT, "data", f"{k}.json"))
        print(f"{k}: {r['fel_fore']} fel på {r['sidor_fore']} sidor -> {r['fel_efter']} fel på {r['sidor_efter']} sidor")
        for o, n in sorted(r["borttaget"].items(), key=lambda x: -x[1]):
            print(f"    {n:6}  {o}")


if __name__ == "__main__":
    main()

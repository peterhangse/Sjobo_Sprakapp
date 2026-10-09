"""Steg 1: hämtar hela sjobo.se och sparar texten per sida i pages.jsonl.

Kör från repo-roten:  python3 scripts/kontroll/hamta.py
Tar ungefär 15 minuter (en sida i taget, med paus mellan anropen).
Avbryts den kan du köra samma kommando igen – redan hämtade sidor hoppas över.
"""
import json, os, re, sys, time
from collections import deque
from urllib.parse import urljoin, urlparse, urlunparse
import requests
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "pages.jsonl")
START = "https://www.sjobo.se/"
DELAY = 0.7
MAX = 3000
DATAFIL = os.path.join(HERE, "..", "..", "data", "sjobo.json")
UA = "Mozilla/5.0 (Sjobo kommun sprakgranskning; uppfoljning)"
SKIP_EXT = re.compile(r"\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|svg|zip|mp4|mp3|ics|txt|xml|webp)$", re.I)
DISALLOW = ["/imagedescription.action2", "/checkoutimages.action2", "/mybookmarks/"]


def norm(u):
    p = urlparse(u)
    if p.scheme not in ("http", "https") or p.netloc not in ("www.sjobo.se", "sjobo.se"):
        return None
    path = p.path or "/"
    if SKIP_EXT.search(path) or path.endswith(".printable") or any(path.startswith(d) for d in DISALLOW):
        return None
    if "/download/" in path or path.startswith("/sitevision/") or "/images/" in path:
        return None
    if not (path == "/" or path.endswith(".html")):
        return None
    return urlunparse(("https", "www.sjobo.se", path, "", "", ""))


BLOCK = ["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "br", "section", "article",
         "header", "footer", "nav", "ul", "ol", "tr", "dt", "dd", "figcaption", "blockquote", "main",
         "aside", "table", "form", "label", "button", "option"]


def smart_text(node):
    """Text där inline-taggar (länkar, fetstil) inte ger falska mellanslag, men block bryts med radbrytning."""
    for t in node.find_all(BLOCK):
        t.insert_before("\n")
        t.insert_after("\n")
    txt = node.get_text("")
    lines = [re.sub(r"[ \t\r\f\v ]+", " ", l).strip() for l in txt.split("\n")]
    return "\n".join(l for l in lines if l)


def extract(html):
    s = BeautifulSoup(html, "html.parser")
    title = (s.title.get_text(strip=True) if s.title else "").replace(" - Sjöbo kommun", "")
    md = s.find("meta", attrs={"name": "description"})
    desc = md.get("content", "").strip() if md else ""
    links = [a.get("href") for a in s.find_all("a", href=True)]
    for t in s.find_all(["script", "style", "noscript", "template"]):
        t.decompose()
    main = s.find("main") or s.body or s
    text = smart_text(main)
    full = smart_text(s.body or s)
    canon = s.find("link", rel="canonical")
    return title, desc, text, full, links, (canon.get("href") if canon else None)


def main():
    done, seen = set(), set()
    if os.path.exists(OUT):
        for line in open(OUT, encoding="utf-8"):
            r = json.loads(line)
            if r.get("status") != "error":
                done.add(r["url"])
    # Alla adresser som appen redan känner till hämtas alltid, även om ingen länk pekar dit
    known = [i["u"] for i in json.load(open(DATAFIL, encoding="utf-8"))["items"]]
    q = deque()
    for u in [START] + known:
        n = norm(u)
        if n and n not in seen:
            seen.add(n); q.append(n)
    sess = requests.Session(); sess.headers["User-Agent"] = UA
    f = open(OUT, "a", encoding="utf-8")
    fetched = 0
    while q and fetched < MAX:
        u = q.popleft()
        try:
            if u in done:
                # länkar från redan hämtade sidor finns inte sparade; hämta om för att hitta länkar billigt nog
                pass
            r = None
            for attempt in range(4):
                try:
                    r = sess.get(u, timeout=30, allow_redirects=True)
                    break
                except requests.RequestException:
                    if attempt == 3:
                        raise
                    time.sleep(3 * (attempt + 1))
            fetched += 1
            rec = {"url": u, "final_url": r.url, "status": r.status_code}
            if r.status_code == 200 and "text/html" in r.headers.get("content-type", ""):
                title, desc, text, full, links, canon = extract(r.text)
                rec.update(title=title, desc=desc, text=text, full=full, canonical=canon)
                for h in links:
                    n = norm(urljoin(r.url, h))
                    if n and n not in seen:
                        seen.add(n); q.append(n)
            if u not in done:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n"); f.flush(); done.add(u)
        except Exception as e:
            if u not in done:
                f.write(json.dumps({"url": u, "status": "error", "error": str(e)}, ensure_ascii=False) + "\n"); f.flush(); done.add(u)
        if fetched % 50 == 0:
            print(f"{fetched} hämtade, kö {len(q)}", flush=True)
        time.sleep(DELAY)
    print(f"Klart: {fetched} hämtade, kö kvar {len(q)}", flush=True)


if __name__ == "__main__":
    main()

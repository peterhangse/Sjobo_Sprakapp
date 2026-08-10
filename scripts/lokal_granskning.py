#!/usr/bin/env python3
"""
lokal_granskning.py — kör språkgranskningen mot DIN lokala modell (Ollama)
i stället för Anthropics moln.

Varför: din scraper (sjobo_stavning.py) anropar Anthropics API och kostar
pengar per sida. Du har GLM och Qwen lokalt på Bosgame. Detta gör granskningen
gratis, privat och suverän — helt i linje med resten av ditt bygge.

SÅ HÄR KOPPLAR DU IN DEN (två små ändringar i sjobo_stavning.py):

  1. Överst, byt/lägg import:
         from lokal_granskning import proofread_chunk_lokal

  2. I proofread_all(), byt anropet:
         all_issues.extend(proofread_chunk(client, chunk))
     mot:
         all_issues.extend(proofread_chunk_lokal(chunk))
     (och du behöver inte längre någon ANTHROPIC_API_KEY eller client)

Systemprompten är densamma som din scraper redan använder — klistrad in här
så modulen är fristående. Ändra modellnamnet nedan om du vill använda en annan.
"""

import json
import re
import urllib.request

# Vilken lokal modell? gpt-oss:20b är snabb och bra på svenska; qwen3-next:80b
# är starkare men långsammare. Byt fritt — den måste finnas i `ollama list`.
LOKAL_MODELL = "gpt-oss:20b"
OLLAMA_URL = "http://127.0.0.1:11434/v1/chat/completions"

# Samma systemprompt som din scraper — oförändrad, så resultaten blir jämförbara.
PROOFREAD_SYSTEM_PROMPT = """Du är en noggrann svensk språkgranskare för en kommunal webbplats.
Du ska identifiera STAVFEL, GRAMMATIKFEL och TYDLIGA SPRÅKFEL i texten du får.

VIKTIGA REGLER:
- Rapportera ENDAST säkra fel. Är du osäker, hoppa över det.
- Hoppa över: stilval, kommatering som är diskutabel, ordval som "kunde varit bättre".
- Egennamn (orter, personer, organisationer) räknas inte som fel även om de ser ovanliga ut.
- Förkortningar som "kl.", "tex" är inte fel.
- "Kommunens", "Sjöbo kommun" osv. är korrekt.
- Var extra noggrann med: särskrivningar, dubbeltecknade konsonanter, böjningsfel,
  felstavade vanliga ord, kongruensfel (t.ex. "barnen är glad").

Returnera ENDAST giltig JSON i formatet:
{
  "fel": [
    {
      "felaktig_text": "exakt det felaktiga stycket eller ordet, högst 15 ord",
      "korrigering": "föreslagen rättning",
      "feltyp": "stavfel" | "grammatik" | "särskrivning" | "annat",
      "kommentar": "kort förklaring (max en mening)"
    }
  ]
}

Om inga fel hittas, returnera: {"fel": []}
INGA markdown-fences, ingen extra text – bara JSON-objektet."""


def proofread_chunk_lokal(text: str, modell: str = LOKAL_MODELL) -> list:
    """Skickar en textbit till din lokala Ollama-modell och returnerar felen.
    Drop-in-ersättning för scraperns proofread_chunk(client, text)."""
    body = json.dumps({
        "model": modell,
        "messages": [
            {"role": "system", "content": PROOFREAD_SYSTEM_PROMPT},
            {"role": "user", "content": f"Granska följande text:\n\n{text}"},
        ],
        "temperature": 0,
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL, data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as svar:
            data = json.loads(svar.read().decode("utf-8"))
    except Exception as e:
        print(f"[lokal-granskning] Fel vid anrop till Ollama: {e}")
        return []

    raw = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    # Skala bort eventuella markdown-fences
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.M).strip()
    try:
        parsed = json.loads(raw)
        return parsed.get("fel", [])
    except json.JSONDecodeError:
        print(f"[lokal-granskning] Kunde inte tolka JSON: {raw[:120]}…")
        return []


# Snabbtest: kör direkt för att prova mot din Ollama
if __name__ == "__main__":
    prov = "Kommunen erbjuder boende plats för aldre. Ansökan görs via hemsidan."
    print("Testar lokal granskning mot", LOKAL_MODELL, "...")
    fel = proofread_chunk_lokal(prov)
    print(json.dumps(fel, ensure_ascii=False, indent=2))

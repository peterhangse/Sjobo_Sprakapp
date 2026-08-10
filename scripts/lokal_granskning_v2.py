#!/usr/bin/env python3
"""
lokal_granskning_v2.py — kör v2-scraperns granskning mot DIN lokala modell (Ollama).

Anpassad till sjobo_stavning_v2.py: samma retry-mönster (MAX_RETRIES, backoff),
samma systemprompt, samma returformat ({"fel":[...]}). Drop-in för proofread_chunk.

Ingen ANTHROPIC_API_KEY. Ingen extern kostnad. Allt på Bosgame.

── SÅ HÄR KOPPLAR DU IN (i sjobo_stavning_v2.py) ─────────────────────────────

1) Överst bland importerna, lägg till:
       from lokal_granskning_v2 import proofread_chunk_lokal

2) I proofread_all(), TA BORT dessa fyra rader:
       api_key = os.environ.get("ANTHROPIC_API_KEY")
       if not api_key:
           sys.exit("Sätt ANTHROPIC_API_KEY ...")
       client = anthropic.Anthropic(api_key=api_key)

3) Byt anropsraden i proofread_all():
       all_issues.extend(proofread_chunk(client, chunk))
   mot:
       all_issues.extend(proofread_chunk_lokal(chunk))

Klart. (Du kan låta `import anthropic` ligga kvar; den används inte längre.)

── Testa fristående först ───────────────────────────────────────────────────
    python3 lokal_granskning_v2.py
Ska hitta felen i testmeningen mot din lokala modell.
"""

import json
import re
import time
import urllib.request

# ── Inställningar ────────────────────────────────────────────────────────────
# Modellen måste finnas i `ollama list`. gpt-oss:20b är snabb och bra på svenska.
# qwen3-next:80b är starkare men långsammare. Prova och jämför mot ditt facit.
LOKAL_MODELL = "gpt-oss:20b"
OLLAMA_URL = "http://127.0.0.1:11434/v1/chat/completions"

MAX_RETRIES = 3
BACKOFF_S = 2
TIMEOUT_S = 180

# Samma systemprompt som v2 använder — klistrad in så modulen är fristående.
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
    """Drop-in för v2:s proofread_chunk(client, text) — men mot lokal Ollama.
    Behåller v2:s retry/backoff-beteende."""
    body = json.dumps({
        "model": modell,
        "messages": [
            {"role": "system", "content": PROOFREAD_SYSTEM_PROMPT},
            {"role": "user", "content": f"Granska följande text:\n\n{text}"},
        ],
        "temperature": 0,
        "stream": False,
    }).encode("utf-8")

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                OLLAMA_URL, data=body,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as svar:
                data = json.loads(svar.read().decode("utf-8"))
            raw = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.M).strip()
            parsed = json.loads(raw)
            return parsed.get("fel", [])
        except json.JSONDecodeError as e:
            print(f"[varning] JSON-fel från modellen: {e} – hoppar över biten")
            return []
        except Exception as e:
            wait = BACKOFF_S * (2 ** attempt)
            print(f"[varning] Ollama-fel (försök {attempt + 1}/{MAX_RETRIES}): {e} – väntar {wait:.0f}s")
            time.sleep(wait)
    print("[fel] Gav upp efter alla försök")
    return []


if __name__ == "__main__":
    prov = "Kommunen erbjuder boende plats för aldre. Ansökan görs via hemsidan innan den 1 mars."
    print(f"Testar lokal granskning mot {LOKAL_MODELL} ...")
    print("(kräver att Ollama kör och att modellen finns i `ollama list`)")
    fel = proofread_chunk_lokal(prov)
    print(json.dumps(fel, ensure_ascii=False, indent=2))

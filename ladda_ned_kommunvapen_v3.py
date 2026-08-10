#!/usr/bin/env python3
import urllib.request
import os
import csv
import time
from urllib.parse import quote

os.makedirs('kommunvapen', exist_ok=True)

with open('kommunvapen_lankar.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
    total = len(rows)

for i, row in enumerate(rows, 1):
    url = row['Direktlank (Wikimedia Commons)']
    
    # Fix: Procentkoda svenska tecken i URL:en
    parts = url.split('/')
    parts[-1] = quote(parts[-1], safe='')
    url = '/'.join(parts)
    
    filnamn = row['Filnamn'].replace(' ', '_')
    kommun = row['Kommun']
    sokvag = os.path.join('kommunvapen', filnamn)

    if os.path.exists(sokvag):
        print(f"[{i}/{total}] REDAN FINNS: {kommun}")
        continue

    retries = 0
    max_retries = 3
    success = False
    
    while retries < max_retries and not success:
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; KommunvapenDownloader/1.0)'}
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                with open(sokvag, 'wb') as f:
                    f.write(response.read())
            print(f"[{i}/{total}] OK: {kommun}")
            success = True
            time.sleep(2)  # Vanta 2 sekunder mellan bilder
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_time = 10 + (retries * 5)
                print(f"[{i}/{total}] VANTAR {wait_time}s (429) for {kommun}...")
                time.sleep(wait_time)
                retries += 1
            else:
                print(f"[{i}/{total}] FEL: {kommun} - {e}")
                break
        except Exception as e:
            print(f"[{i}/{total}] FEL: {kommun} - {e}")
            break

print("\nKlar!")
pngs = [f for f in os.listdir('kommunvapen') if f.endswith('.png')]
print(f"Totalt nedladdade: {len(pngs)} av {total}")

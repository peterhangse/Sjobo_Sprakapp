#!/usr/bin/env python3
import urllib.request
import os
import csv
import time

os.makedirs('kommunvapen', exist_ok=True)

with open('kommunvapen_lankar.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
    total = len(rows)

for i, row in enumerate(rows, 1):
    url = row['Direktlank (Wikimedia Commons)']
    filnamn = row['Filnamn'].replace(' ', '_')
    kommun = row['Kommun']
    sokvag = os.path.join('kommunvapen', filnamn)

    if os.path.exists(sokvag):
        print(f"[{i}/{total}] REDAN FINNS: {kommun}")
        continue

    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (compatible; KommunvapenDownloader/1.0)'}
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            with open(sokvag, 'wb') as f:
                f.write(response.read())
        print(f"[{i}/{total}] OK: {kommun}")
        time.sleep(0.5)
    except Exception as e:
        print(f"[{i}/{total}] FEL: {kommun} - {e}")
        time.sleep(1)

print("\nKlar!")
print(f"Totalt nedladdade: {len([f for f in os.listdir('kommunvapen') if f.endswith('.png')])} st")

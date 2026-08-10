#!/usr/bin/env python3
"""
Nedladdningsskript for Sveriges kommunvapen fran Wikimedia Commons.
Kor: python3 ladda_ned_kommunvapen.py
"""
import urllib.request
import os
import csv

# Skapa mapp for bilderna
os.makedirs('kommunvapen', exist_ok=True)

# Las CSV-filen
with open('kommunvapen_lankar.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    total = sum(1 for _ in open('kommunvapen_lankar.csv')) - 1

with open('kommunvapen_lankar.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader, 1):
        url = row['Direktlank (Wikimedia Commons)']
        filnamn = row['Filnamn'].replace(' ', '_')  # Wikimedia anvander underscores
        kommun = row['Kommun']

        sokvag = os.path.join('kommunvapen', filnamn)

        try:
            urllib.request.urlretrieve(url, sokvag)
            print(f"[{i}/{total}] OK: {kommun}")
        except Exception as e:
            print(f"[{i}/{total}] FEL: {kommun} - {e}")

print("\nKlar! Alla kommunvapen sparade i mappen 'kommunvapen/'")

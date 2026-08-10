#!/bin/bash
# Nedladdning av Sveriges kommunvapen fran Wikimedia Commons
# Kor: bash ladda_ned_kommunvapen.sh

mkdir -p kommunvapen

echo "Laddar ned 290 kommunvapen..."
while IFS= read -r url; do
    wget -q -P kommunvapen/ "$url"
done < kommunvapen_url_lista.txt

echo "Klar! Alla kommunvapen sparade i mappen kommunvapen/"

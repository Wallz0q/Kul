#!/usr/bin/env bash
set -e
echo "== SC UNSERBOT TARGET V1 =="
command -v node >/dev/null 2>&1 || { echo "Node.js belum terpasang."; exit 1; }
npm install
[ -f .env ] || cp .env.example .env
echo "Install selesai. Isi .env lalu jalankan: npm start"

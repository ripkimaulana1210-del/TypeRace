#!/bin/bash
# Skrip Auto-Deploy CI/CD Sederhana untuk TypeRace di CT 101
cd "$(dirname "$0")"

# Ambil informasi perubahan dari GitHub
git fetch origin main > /dev/null 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

# Jika ada perbedaan commit antara server lokal dan GitHub
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Perubahan terdeteksi di GitHub! Memulai auto-pull & rebuild..."
    git pull origin main
    docker compose up -d --build
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Berhasil di-deploy ke versi terbaru ($REMOTE)!"
fi

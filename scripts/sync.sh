#!/usr/bin/env bash
# Commit + push otomatis. Dipanggil manual atau lewat hook Claude Code (Stop).
set -e
cd "$(git rev-parse --show-toplevel)"
git add -A
git diff --cached --quiet && exit 0
git commit -m "auto: $(date +'%Y-%m-%d %H:%M')"
git push origin "$(git branch --show-current)"

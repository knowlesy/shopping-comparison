#!/bin/bash
set -e

echo "[Scraper-Pod] Starting Xvfb virtual display on :99..."
exec xvfb-run --server-args="-screen 0 1920x1080x24 -ac -nolisten tcp -dpi 96" node src/server.js "$@"

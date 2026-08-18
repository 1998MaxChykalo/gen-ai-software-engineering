#!/usr/bin/env bash
# make-screenshot.sh <input.txt> <output.png> <title> [height]
# Renders a text log as a terminal-styled PNG using headless Chrome.
set -euo pipefail

IN="$1"; OUT="$2"; TITLE="$3"; HEIGHT="${4:-900}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP_HTML="$(mktemp -t shot).html"

python3 - "$IN" "$TITLE" > "$TMP_HTML" <<'PY'
import html, sys
body = open(sys.argv[1], encoding="utf-8", errors="replace").read()
title = sys.argv[2]
print(f"""<!doctype html><meta charset="utf-8">
<style>
  body {{ background:#1e1e2e; margin:0; padding:24px; font-family:-apple-system,sans-serif; }}
  .win {{ background:#11111b; border-radius:10px; box-shadow:0 8px 30px rgba(0,0,0,.6); overflow:hidden; }}
  .bar {{ background:#181825; padding:10px 14px; display:flex; align-items:center; gap:8px; }}
  .dot {{ width:12px; height:12px; border-radius:50%; }}
  .title {{ color:#cdd6f4; font-size:13px; margin-left:10px; }}
  pre {{ margin:0; padding:18px 20px; color:#a6e3a1; font:12.5px/1.5 "SF Mono",Menlo,monospace; white-space:pre-wrap; }}
</style>
<div class="win">
  <div class="bar">
    <span class="dot" style="background:#f38ba8"></span>
    <span class="dot" style="background:#f9e2af"></span>
    <span class="dot" style="background:#a6e3a1"></span>
    <span class="title">{html.escape(title)}</span>
  </div>
  <pre>{html.escape(body)}</pre>
</div>""")
PY

"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --screenshot="$OUT" --window-size="1100,$HEIGHT" "file://$TMP_HTML" 2>/dev/null
rm -f "$TMP_HTML"
echo "wrote $OUT"

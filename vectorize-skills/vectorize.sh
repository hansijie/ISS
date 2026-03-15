#!/bin/bash
# Vectorize Skills - Standalone Tool
# 独立的向量化脚本

set -e

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$SKILL_DIR/vectorize-skills.js" ]; then
  echo "❌ Error: Vectorize script not found"
  echo "   Expected: $SKILL_DIR/vectorize-skills.js"
  exit 1
fi

if [ ! -d "$SKILL_DIR/node_modules" ]; then
  echo "📦 Installing dependencies..."
  cd "$SKILL_DIR"
  npm install --silent
  echo ""
fi

echo "🔢 Vectorizing all OpenClaw skills..."
echo ""

cd "$SKILL_DIR"
node vectorize-skills.js

echo ""
echo "✅ Vectorization complete!"
echo "   ISS hook can now retrieve relevant skills at runtime."

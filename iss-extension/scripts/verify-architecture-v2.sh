#!/bin/bash
# ISS 架构验证脚本 v2 - 验证完全剥离后的架构

echo "🔍 ISS 架构验证 (完全剥离版本)"
echo "================================="
echo ""

# 1. vectorize-skills skill（独立）
echo "1️⃣ vectorize-skills skill (独立工具)"
echo "   Location: ~/.openclaw/skills/vectorize-skills/"

if [ -f "$HOME/.openclaw/skills/vectorize-skills/vectorize-skills.js" ]; then
  echo "   ✅ vectorize-skills.js exists"
else
  echo "   ❌ vectorize-skills.js NOT found"
fi

if [ -f "$HOME/.openclaw/skills/vectorize-skills/package.json" ]; then
  echo "   ✅ package.json exists"
else
  echo "   ❌ package.json NOT found"
fi

if [ -d "$HOME/.openclaw/skills/vectorize-skills/node_modules" ]; then
  echo "   ✅ Dependencies installed"
else
  echo "   ❌ Dependencies NOT installed"
fi
echo ""

# 2. ISS Hook
echo "2️⃣ ISS Hook (消息拦截 + 召回)"
echo "   Location: ~/.openclaw/hooks/iss/"

if [ -f "$HOME/.openclaw/hooks/iss/HOOK.md" ]; then
  echo "   ✅ HOOK.md exists"
else
  echo "   ❌ HOOK.md NOT found"
fi

if [ -f "$HOME/.openclaw/hooks/iss/handler.ts" ]; then
  echo "   ✅ handler.ts exists"
else
  echo "   ❌ handler.ts NOT found"
fi
echo ""

# 3. ISS Extension（只保留 skill-retriever）
echo "3️⃣ ISS Extension (共享召回逻辑)"
echo "   Location: ~/.openclaw/extensions/openclaw-iss/"

if [ -f "$HOME/.openclaw/extensions/openclaw-iss/skill-retriever.js" ]; then
  echo "   ✅ skill-retriever.js exists (ISS hook 依赖)"
else
  echo "   ❌ skill-retriever.js NOT found"
fi

if [ -f "$HOME/.openclaw/extensions/openclaw-iss/scripts/vectorize-skills.js" ]; then
  echo "   ⚠️  OLD vectorize-skills.js still exists (可删除)"
else
  echo "   ✅ Old vectorize-skills.js removed"
fi
echo ""

# 4. 依赖关系
echo "4️⃣ 依赖关系"
echo "   vectorize-skills skill:"
echo "      → 独立运行，不依赖 ISS extension"
echo "   ISS hook:"
echo "      → 依赖 skill-retriever.js (在 ISS extension 中)"
echo ""

# 5. 配置状态
echo "5️⃣ 配置状态"
echo "   ISS hook enabled:"
jq -r '.hooks.internal.entries.iss.enabled // "not set"' ~/.openclaw/openclaw.json | sed 's/^/      /'

echo "   Skills allowBundled:"
jq -r '.skills.allowBundled // [] | if length == 0 then "[] (禁用所有 bundled)" else . end' ~/.openclaw/openclaw.json | sed 's/^/      /'
echo ""

# 6. 环境变量
echo "6️⃣ 环境变量"
if [ -n "$OPENCLAW_SKILLS_VECTOR_BUCKET" ]; then
  echo "   ✅ OPENCLAW_SKILLS_VECTOR_BUCKET: $OPENCLAW_SKILLS_VECTOR_BUCKET"
else
  echo "   ⚠️  OPENCLAW_SKILLS_VECTOR_BUCKET not set"
fi
echo ""

echo "================================="
echo "✅ 架构验证完成！"
echo ""
echo "📝 架构总结："
echo "   - vectorize-skills: 独立 skill，可单独运行"
echo "   - ISS hook: 消息拦截 + 动态召回"
echo "   - skill-retriever: 共享召回逻辑模块"
echo ""
echo "🚀 下一步："
echo "   1. 测试 vectorize-skills: cd ~/.openclaw/skills/vectorize-skills && npm run vectorize"
echo "   2. 测试 ISS hook: 发送测试消息到 Gateway"
echo "   3. (可选) 删除旧的向量化脚本: rm ~/.openclaw/extensions/openclaw-iss/scripts/vectorize-skills.js"

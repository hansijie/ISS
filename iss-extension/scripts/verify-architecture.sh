#!/bin/bash
# ISS 架构验证脚本

echo "🔍 ISS 架构验证"
echo "================"
echo ""

# 1. 检查 vectorize-skills skill
echo "1️⃣ Checking vectorize-skills skill..."
if [ -f "$HOME/.openclaw/skills/vectorize-skills/SKILL.md" ]; then
  echo "   ✅ vectorize-skills skill exists"
else
  echo "   ❌ vectorize-skills skill NOT found"
fi
echo ""

# 2. 检查 ISS hook
echo "2️⃣ Checking ISS hook..."
if [ -f "$HOME/.openclaw/hooks/iss/HOOK.md" ]; then
  echo "   ✅ ISS hook exists"
else
  echo "   ❌ ISS hook NOT found"
fi

if [ -f "$HOME/.openclaw/hooks/iss/handler.ts" ]; then
  echo "   ✅ ISS handler exists"
else
  echo "   ❌ ISS handler NOT found"
fi
echo ""

# 3. 检查 ISS extension（skill-retriever）
echo "3️⃣ Checking ISS extension..."
if [ -d "$HOME/.openclaw/extensions/openclaw-iss" ]; then
  echo "   ✅ ISS extension directory exists"
  
  if [ -f "$HOME/.openclaw/extensions/openclaw-iss/skill-retriever.js" ]; then
    echo "   ✅ skill-retriever.js exists"
  else
    echo "   ❌ skill-retriever.js NOT found"
  fi
  
  if [ -f "$HOME/.openclaw/extensions/openclaw-iss/scripts/vectorize-skills.js" ]; then
    echo "   ✅ vectorize-skills.js exists"
  else
    echo "   ❌ vectorize-skills.js NOT found"
  fi
else
  echo "   ❌ ISS extension NOT found"
fi
echo ""

# 4. 检查配置
echo "4️⃣ Checking configuration..."
echo "   Skills allowBundled:"
jq -r '.skills.allowBundled // "not set"' ~/.openclaw/openclaw.json | sed 's/^/      /'

echo "   ISS plugin enabled:"
jq -r '.plugins.entries."openclaw-iss".enabled // "not set"' ~/.openclaw/openclaw.json | sed 's/^/      /'

echo "   ISS hook enabled:"
jq -r '.hooks.internal.entries.iss.enabled // "not set"' ~/.openclaw/openclaw.json | sed 's/^/      /'
echo ""

# 5. 检查环境变量
echo "5️⃣ Checking environment variables..."
if [ -n "$OPENCLAW_SKILLS_VECTOR_BUCKET" ]; then
  echo "   ✅ OPENCLAW_SKILLS_VECTOR_BUCKET: $OPENCLAW_SKILLS_VECTOR_BUCKET"
else
  echo "   ⚠️  OPENCLAW_SKILLS_VECTOR_BUCKET not set"
fi

if [ -n "$AWS_REGION" ]; then
  echo "   ✅ AWS_REGION: $AWS_REGION"
else
  echo "   ⚠️  AWS_REGION not set (will use default: us-east-1)"
fi
echo ""

# 6. 检查 S3 数据
echo "6️⃣ Checking S3 vectorized skills..."
if [ -n "$OPENCLAW_SKILLS_VECTOR_BUCKET" ]; then
  echo "   Checking s3://$OPENCLAW_SKILLS_VECTOR_BUCKET/skills/..."
  
  COUNT=$(aws s3 ls s3://$OPENCLAW_SKILLS_VECTOR_BUCKET/skills/ --region ${AWS_REGION:-us-east-1} 2>/dev/null | grep -c "\.json$" || echo "0")
  
  if [ "$COUNT" -gt "0" ]; then
    echo "   ✅ Found $COUNT vectorized skills"
  else
    echo "   ⚠️  No vectorized skills found (run vectorize-skills first)"
  fi
else
  echo "   ⚠️  Skipped (bucket not configured)"
fi
echo ""

echo "================"
echo "✅ Verification complete!"
echo ""
echo "Next steps:"
echo "  1. If vectorized skills not found, run: npm run vectorize (in ISS extension dir)"
echo "  2. Enable ISS hook: openclaw hooks enable iss"
echo "  3. Restart Gateway: kill the gateway process or restart OpenClaw"

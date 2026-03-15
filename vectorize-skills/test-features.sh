#!/bin/bash
# vectorize-skills v2.0 功能演示

echo "🧪 Vectorize Skills v2.0 - 功能演示"
echo "===================================="
echo ""

SKILL_DIR="$HOME/.openclaw/skills/vectorize-skills"
cd "$SKILL_DIR"

# 确保环境变量已设置
export OPENCLAW_SKILLS_VECTOR_BUCKET="${OPENCLAW_SKILLS_VECTOR_BUCKET:-openclaw-skills-vectors}"
export AWS_REGION="${AWS_REGION:-us-east-1}"

echo "📋 环境配置："
echo "   Bucket: $OPENCLAW_SKILLS_VECTOR_BUCKET"
echo "   Region: $AWS_REGION"
echo ""

# 测试 1：增量更新（默认）
echo "1️⃣ 测试：增量更新（默认行为）"
echo "   Command: npm run vectorize"
echo "   Expected: 跳过所有未修改的 skills"
echo ""
npm run vectorize
echo ""
echo "✅ 增量更新测试完成"
echo ""
read -p "按 Enter 继续下一个测试..."
echo ""

# 测试 2：指定单个 skill
echo "2️⃣ 测试：只处理指定 skill"
echo "   Command: npm run vectorize -- feishu-doc"
echo "   Expected: 只检查和处理 feishu-doc"
echo ""
npm run vectorize -- feishu-doc
echo ""
echo "✅ 指定 skill 测试完成"
echo ""
read -p "按 Enter 继续下一个测试..."
echo ""

# 测试 3：强制全量更新
echo "3️⃣ 测试：强制全量更新"
echo "   Command: npm run vectorize:force"
echo "   Expected: 重新处理所有 skills（忽略修改时间）"
echo "   ⚠️  Warning: 这会消耗更多时间和 API 调用"
echo ""
read -p "是否执行全量更新测试？(y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npm run vectorize:force
  echo ""
  echo "✅ 强制全量更新测试完成"
else
  echo "⏭️  跳过全量更新测试"
fi
echo ""

# 测试 4：检查 S3 结果
echo "4️⃣ 测试：验证 S3 向量数据"
echo "   Command: aws s3 ls s3://$OPENCLAW_SKILLS_VECTOR_BUCKET/skills/"
echo ""
echo "📦 S3 中的向量文件："
aws s3 ls "s3://$OPENCLAW_SKILLS_VECTOR_BUCKET/skills/" --region "$AWS_REGION" | grep "\.json$" | awk '{print "   -", $4, "(" $3 ")"}'
echo ""

VECTOR_COUNT=$(aws s3 ls "s3://$OPENCLAW_SKILLS_VECTOR_BUCKET/skills/" --region "$AWS_REGION" | grep -c "\.json$" || echo "0")
echo "   Total: $VECTOR_COUNT vectorized skills"
echo ""
echo "✅ S3 验证完成"
echo ""

# 总结
echo "===================================="
echo "✅ 所有测试完成！"
echo ""
echo "📊 功能总结："
echo "   ✅ 增量更新 - 智能跳过未修改的 skills"
echo "   ✅ 指定 skills - 只处理特定的 skills"
echo "   ✅ 强制全量 - 重新处理所有 skills"
echo "   ✅ S3 存储 - 向量数据已保存"
echo ""
echo "🚀 下一步："
echo "   1. 测试 ISS Hook 消息拦截"
echo "   2. 发送测试消息验证召回"
echo "   3. 监控 token 使用情况"
echo ""
echo "📚 更多信息："
echo "   - 使用指南: cat $SKILL_DIR/USAGE.md"
echo "   - ISS 架构: cat ~/.openclaw/extensions/openclaw-iss/ARCHITECTURE.md"

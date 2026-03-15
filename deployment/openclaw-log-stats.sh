#!/bin/bash
# OpenClaw 日志分析脚本

# 默认查看最近 1000 条
LINES=${1:-1000}

echo "📊 OpenClaw Gateway 日志分析"
echo "================================"
echo ""

# 1. 错误统计
echo "❌ 错误统计:"
sudo journalctl -u openclaw-gateway -n $LINES | grep -i error | wc -l
echo ""

# 2. ISS 召回统计
echo "🎯 ISS 召回统计:"
sudo journalctl -u openclaw-gateway -n $LINES | grep "Found.*skill" | wc -l
echo ""

# 3. 平均召回时间
echo "⏱️  平均召回时间:"
sudo journalctl -u openclaw-gateway -n $LINES | grep "Retrieval time" | \
  sed 's/.*Retrieval time: \([0-9]*\)ms.*/\1/' | \
  awk '{sum+=$1; count++} END {if(count>0) print sum/count "ms"; else print "N/A"}'
echo ""

# 4. 最常召回的 skills
echo "📦 Top 5 召回的 skills:"
sudo journalctl -u openclaw-gateway -n $LINES | grep -oP '\d+\. \K[a-z-]+' | \
  sort | uniq -c | sort -rn | head -5
echo ""

# 5. 最近的错误
echo "🔴 最近的错误 (最多 5 条):"
sudo journalctl -u openclaw-gateway -n $LINES | grep -i error | tail -5
echo ""

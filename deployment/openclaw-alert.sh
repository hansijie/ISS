#!/bin/bash
# OpenClaw 日志监控告警脚本

# 配置
ALERT_EMAIL="your-email@example.com"
ERROR_THRESHOLD=5  # 5分钟内超过这么多错误就告警

# 检查最近 5 分钟的错误
ERROR_COUNT=$(sudo journalctl -u openclaw-gateway --since "5 minutes ago" | grep -i error | wc -l)

if [ $ERROR_COUNT -gt $ERROR_THRESHOLD ]; then
    # 获取错误详情
    ERRORS=$(sudo journalctl -u openclaw-gateway --since "5 minutes ago" | grep -i error | tail -10)
    
    # 发送邮件告警（需要配置 mail 命令）
    echo "OpenClaw Gateway 错误告警
    
时间: $(date)
错误数量: $ERROR_COUNT (阈值: $ERROR_THRESHOLD)

最近的错误:
$ERRORS
    " | mail -s "OpenClaw Gateway Alert" $ALERT_EMAIL
    
    # 或者通过 OpenClaw 发送消息（如果配置了飞书）
    # openclaw message send --target your-feishu-id --message "Gateway 错误告警：$ERROR_COUNT 个错误"
    
    echo "$(date): Alert sent! Error count: $ERROR_COUNT"
fi

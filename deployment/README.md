# Deployment Files

生产环境部署相关文件。

## systemd Service

### openclaw-gateway.service

基础版本，日志输出到 systemd journal。

**安装**：
```bash
sudo cp openclaw-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable openclaw-gateway
sudo systemctl start openclaw-gateway
```

**查看日志**：
```bash
sudo journalctl -u openclaw-gateway -f
```

### openclaw-gateway-with-logs.service

带文件日志版本，日志输出到 `/var/log/openclaw/`。

**安装**：
```bash
# 创建日志目录
sudo mkdir -p /var/log/openclaw
sudo chown ubuntu:ubuntu /var/log/openclaw

# 安装 service
sudo cp openclaw-gateway-with-logs.service /etc/systemd/system/openclaw-gateway.service
sudo systemctl daemon-reload
sudo systemctl restart openclaw-gateway
```

**查看日志**：
```bash
tail -f /var/log/openclaw/gateway.log
```

## 日志监控工具

### openclaw-log-stats.sh

日志统计分析脚本。

**安装**：
```bash
chmod +x openclaw-log-stats.sh
sudo mv openclaw-log-stats.sh /usr/local/bin/openclaw-log-stats
```

**使用**：
```bash
# 分析最近 1000 条日志
openclaw-log-stats

# 分析最近 5000 条日志
openclaw-log-stats 5000
```

**输出示例**：
```
📊 OpenClaw Gateway 日志分析
================================

❌ 错误统计: 3

🎯 ISS 召回统计: 25

⏱️  平均召回时间: 235ms

📦 Top 5 召回的 skills:
   15 feishu-doc
   12 feishu-wiki
    8 openclaw-github-assistant
    5 feishu-drive
    3 security-audit-toolkit
```

### openclaw-alert.sh

自动告警脚本（可选）。

**配置**：
```bash
# 编辑脚本中的配置
ALERT_EMAIL="your-email@example.com"
ERROR_THRESHOLD=5

# 安装
chmod +x openclaw-alert.sh
sudo mv openclaw-alert.sh /usr/local/bin/openclaw-alert

# 添加到 crontab（每 5 分钟检查一次）
crontab -e
# 添加：
*/5 * * * * /usr/local/bin/openclaw-alert >> /var/log/openclaw-alert.log 2>&1
```

## 特性

### systemd Service

- ✅ **自动重启**：Restart=always（5秒后）
- ✅ **开机自启**：WantedBy=multi-user.target
- ✅ **环境变量**：自动加载 `~/.openclaw/.env`
- ✅ **资源限制**：LimitNOFILE=65536, LimitNPROC=4096
- ✅ **优雅关闭**：TimeoutStopSec=30

### 日志管理

- ✅ **实时监控**：journalctl -f 或 tail -f
- ✅ **统计分析**：openclaw-log-stats
- ✅ **自动告警**：openclaw-alert（可选）
- ✅ **日志轮转**：logrotate（文件日志版本）

## 环境变量

在 `~/.openclaw/.env` 中配置：

```bash
# GitHub Integration
GITHUB_TOKEN=your_token_here
GITHUB_USERNAME=your_username

# ISS - Intelligent Skill Selection
OPENCLAW_SKILLS_VECTOR_BUCKET=openclaw-skills-vectors
AWS_REGION=us-east-1
ISS_TOP_K=3
ISS_THRESHOLD=0.2
ISS_ENABLED=true
```

## 故障排查

### Service 无法启动

```bash
# 查看状态
sudo systemctl status openclaw-gateway

# 查看详细日志
sudo journalctl -u openclaw-gateway -n 100 --no-pager
```

### 日志太多

配置 logrotate：

```bash
sudo tee /etc/logrotate.d/openclaw << EOF
/var/log/openclaw/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 ubuntu ubuntu
}
EOF
```

### 权限问题

```bash
# 确保日志目录权限正确
sudo chown -R ubuntu:ubuntu /var/log/openclaw

# 确保 service 文件权限正确
sudo chmod 644 /etc/systemd/system/openclaw-gateway.service
```

# OpenClaw ISS 安装指南

## 前置要求

- Node.js >= 18.0.0
- AWS CLI
- OpenClaw (任何版本)
- AWS 账号（已配置凭证）

---

## 安装步骤

### 1. 克隆扩展

```bash
cd ~/.openclaw/extensions
git clone https://github.com/your-repo/openclaw-iss.git
cd openclaw-iss
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 AWS

```bash
# 如果未配置，运行：
aws configure

# 输入：
# AWS Access Key ID: YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region name: us-east-1
# Default output format: json
```

### 4. 初始化 S3 Vectors

```bash
chmod +x scripts/setup-s3.sh
./scripts/setup-s3.sh
```

**输出示例：**

```
========================================
OpenClaw ISS - S3 Vectors 初始化
========================================

配置:
  S3 Bucket: openclaw-skills-vectors
  AWS Region: us-east-1

🔑 Checking AWS credentials...
✅ AWS credentials configured

📦 Creating S3 bucket: openclaw-skills-vectors
✅ Bucket created successfully

🔄 Enabling versioning...
✅ Versioning enabled

🔍 Attempting to enable S3 Vectors...
⚠️  S3 Vectors API not available (preview feature)
   ℹ️  ISS will use client-side vector search (still works!)

✅ S3 Vectors 初始化完成！
```

### 5. 向量化 Skills

```bash
npm run vectorize
```

**预期输出：**

```
🔄 Starting OpenClaw skills vectorization...
📁 Skills directory: /home/ubuntu/.openclaw/workspace/skills
☁️  S3 bucket: openclaw-skills-vectors
📦 Found 11 skill directories

📦 Processing: weather
   Description: Get current weather and forecasts...
   🔄 Generating embedding...
   ✅ Success!

...

📊 Summary:
   ✅ Successful: 11
   ❌ Failed: 0

✅ Vectorization complete!
```

### 6. 启用扩展

编辑 `~/.openclaw/openclaw.json`：

```json
{
  "extensions": {
    "openclaw-iss": {
      "enabled": true,
      "path": "~/.openclaw/extensions/openclaw-iss"
    }
  }
}
```

### 7. 重启 OpenClaw

```bash
openclaw restart
```

---

## 验证安装

### 测试 ISS 是否工作

1. 启动 OpenClaw
2. 发送测试消息："帮我查今天天气"
3. 检查控制台输出

**预期输出：**

```
🔍 ISS: Retrieving skills for: "帮我查今天天气"
   ✅ Found 1 relevant skill(s):
      1. weather (score: 0.920)
   ⏱️  Retrieval time: 95ms
   ✅ Skills injected successfully
```

---

## 故障排查

### 问题 1：npm install 失败

**错误：** `gyp ERR! build error`

**解决：**

```bash
# macOS
xcode-select --install

# Linux
sudo apt-get install build-essential

# 然后重新运行
npm install
```

### 问题 2：AWS 凭证未配置

**错误：** `Unable to locate credentials`

**解决：**

```bash
aws configure

# 或设置环境变量：
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1
```

### 问题 3：OpenClaw 找不到扩展

**错误：** `Extension not found: openclaw-iss`

**解决：**

1. 检查路径是否正确：`~/.openclaw/extensions/openclaw-iss`
2. 检查 `openclaw.json` 配置是否正确
3. 重启 OpenClaw

### 问题 4：向量化脚本失败

**错误：** `Skills directory not found`

**解决：**

```bash
# 检查 skills 目录是否存在
ls -la ~/.openclaw/workspace/skills/

# 如果不存在，安装一些 skills：
openclaw skill install weather
```

---

## 下一步

- 阅读 [README.md](README.md) 了解使用方式
- 查看 [DESIGN.md](docs/DESIGN.md) 了解架构设计
- 加入 [OpenClaw Discord](https://discord.com/invite/clawd) 讨论

---

**安装遇到问题？** [提交 Issue](https://github.com/your-repo/openclaw-iss/issues)

# ISS - Intelligent Skill Selection

OpenClaw 的智能 Skill 检索系统，使用向量相似度动态召回相关 skills，实现 90% token 节省。

## 🎯 功能特性

- **智能召回**：基于 Amazon Nova MME 向量化和余弦相似度
- **增量更新**：只向量化新增或修改的 skills（节省 90% 成本）
- **无侵入式**：通过 message hook 集成，不修改 OpenClaw 核心代码
- **高性能**：检索延迟 ~200-250ms，缓存命中 ~50ms
- **自动化**：用户消息自动触发召回，无需手动干预

## 📦 组件

### 1. vectorize-skills (离线向量化工具)

独立的向量化工具，扫描并向量化所有 OpenClaw skills。

**位置**: `vectorize-skills/`

**特性**:
- ✅ 增量更新（默认）
- ✅ 强制全量更新（--force）
- ✅ 指定 skills 处理
- ✅ 智能跳过未修改的

**使用**:
```bash
cd vectorize-skills
npm install
npm run vectorize           # 增量更新
npm run vectorize:force     # 强制全量
```

### 2. ISS Hook (运行时召回)

OpenClaw 内部 hook，拦截消息并动态召回相关 skills。

**位置**: `iss-hook/`

**工作流程**:
1. 监听 `message:preprocessed` 事件
2. 向量化用户查询
3. 从 S3 召回 top-K skills
4. 注入 `<available_skills>` 块

### 3. ISS Extension (核心模块)

共享的召回逻辑模块。

**位置**: `iss-extension/`

**功能**:
- skill-retriever.js - 向量召回逻辑
- config.json - 配置文件

## 🚀 快速开始

### 前置要求

- OpenClaw >= 2026.3.11
- Node.js >= 18.0.0
- AWS 账号（Bedrock + S3）
- AWS CLI 已配置

### 安装步骤

**1. 创建 S3 桶**

```bash
aws s3 mb s3://openclaw-skills-vectors --region us-east-1
```

**2. 安装 vectorize-skills**

```bash
# 复制到 OpenClaw skills 目录
cp -r vectorize-skills ~/.openclaw/skills/

# 安装依赖
cd ~/.openclaw/skills/vectorize-skills
npm install

# 设置环境变量
export OPENCLAW_SKILLS_VECTOR_BUCKET="openclaw-skills-vectors"
export AWS_REGION="us-east-1"

# 首次向量化（全量）
npm run vectorize:force
```

**3. 安装 ISS Hook**

```bash
# 复制到 OpenClaw hooks 目录
cp -r iss-hook ~/.openclaw/hooks/iss

# 启用 hook
openclaw hooks enable iss
```

**4. 安装 ISS Extension**

```bash
# 复制到 OpenClaw extensions 目录
cp -r iss-extension ~/.openclaw/extensions/openclaw-iss

# 安装依赖
cd ~/.openclaw/extensions/openclaw-iss
npm install
```

**5. 重启 OpenClaw Gateway**

```bash
openclaw gateway restart
```

## ⚙️ 配置

### 环境变量

在 `~/.openclaw/.env` 中添加：

```bash
OPENCLAW_SKILLS_VECTOR_BUCKET=openclaw-skills-vectors
AWS_REGION=us-east-1
ISS_TOP_K=3
ISS_THRESHOLD=0.2
ISS_ENABLED=true
```

### OpenClaw 配置

在 `~/.openclaw/openclaw.json` 中：

```json
{
  "skills": {
    "allowBundled": []
  },
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "iss": {
          "enabled": true
        }
      }
    }
  }
}
```

## 📊 性能指标

| 指标 | 性能 |
|------|------|
| 检索延迟 | 200-250ms |
| Token 节省 | 理论 75% |
| 向量化速度 | ~250ms per skill |
| 缓存命中延迟 | ~50ms |

### 增量更新性能（vectorize-skills v2.0）

| 场景 | v1.0 (全量) | v2.0 (增量) | 改善 |
|------|------------|------------|------|
| 首次运行 | 2.5s | 2.5s | 0% |
| 无修改 | 2.5s | 0.2s | **92%** ✅ |
| 1个修改 | 2.5s | 0.45s | **82%** ✅ |
| 成本 | $0.001 | $0.0001 | **90%** ✅ |

## 🏗️ 架构

```
┌─────────────────────────────────────┐
│  vectorize-skills (离线)            │
│  扫描 → 向量化 → 存储到 S3          │
└─────────────────────────────────────┘
              ↓ 写入
┌─────────────────────────────────────┐
│  S3 Vectors (向量存储)              │
│  s3://bucket/skills/*.json          │
└─────────────────────────────────────┘
              ↓ 读取
┌─────────────────────────────────────┐
│  ISS Hook (运行时)                  │
│  拦截 → 召回 → 注入                 │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  OpenClaw Agent                     │
│  处理消息 + 召回的 skills           │
└─────────────────────────────────────┘
```

## 📝 使用示例

### 日常使用（自动）

```
用户: "帮我查飞书文档"
    ↓
ISS 自动召回:
    1. feishu-doc (0.662)
    2. feishu-wiki (0.584)
    3. feishu-drive (0.523)
    ↓
Agent 使用 feishu-doc 处理
```

### 添加新 Skill

```bash
# 1. 添加新 skill
mkdir ~/.openclaw/workspace/skills/new-skill
vim ~/.openclaw/workspace/skills/new-skill/SKILL.md

# 2. 增量向量化
cd ~/.openclaw/skills/vectorize-skills
npm run vectorize

# 输出：
# ✅ Processed: 1 (new-skill)
# ⏭️  Skipped: 5 (unchanged)

# 3. 自动生效（无需重启）
```

## 🔧 故障排查

### ISS Hook 未触发

```bash
# 检查 hook 状态
openclaw hooks list | grep iss

# 启用 hook
openclaw hooks enable iss

# 重启 Gateway
openclaw gateway restart
```

### 向量化失败

```bash
# 检查 S3 权限
aws s3 ls s3://openclaw-skills-vectors/

# 检查 Bedrock 权限
aws bedrock list-foundation-models --region us-east-1

# 强制重新向量化
npm run vectorize:force
```

### 检索结果为空

```bash
# 检查相似度阈值（默认 0.2）
export ISS_THRESHOLD=0.1

# 检查 S3 中的向量数据
aws s3 ls s3://openclaw-skills-vectors/skills/
```

## 📚 文档

- [ARCHITECTURE.md](iss-extension/ARCHITECTURE.md) - 架构设计
- [vectorize-skills/USAGE.md](vectorize-skills/USAGE.md) - 使用指南
- [vectorize-skills/CHANGELOG.md](vectorize-skills/CHANGELOG.md) - 版本历史
- [iss-hook/HOOK.md](iss-hook/HOOK.md) - Hook 文档

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👤 作者

hansijie - [@hansijie](https://github.com/hansijie)

## 🙏 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 强大的 AI Agent 平台
- [Amazon Nova Embeddings](https://aws.amazon.com/bedrock/) - 高质量向量化
- [S3 Vectors](https://aws.amazon.com/s3/) - 可靠的向量存储

---

**版本**: v2.0.0  
**更新日期**: 2026-03-15  
**状态**: ✅ 生产就绪

# ISS - Intelligent Skill Selection

OpenClaw 的智能 Skill 检索系统，使用向量相似度动态召回相关 skills，实现 **90% token 节省**。

## 📖 项目目的

### 问题背景

在 OpenClaw 中，系统默认会将**所有可用的 skills**（可能有几十个甚至上百个）注入到每次对话的 system prompt 中。这导致：

- ❌ **Token 消耗巨大**：每次对话都要包含所有 skills 的描述（~2000 tokens）
- ❌ **成本高昂**：大量无关 skills 浪费 API 调用费用
- ❌ **响应变慢**：更长的 prompt 增加模型处理时间
- ❌ **效率低下**：模型需要在大量无关 skills 中做选择

**举例**：用户询问"帮我查飞书文档"，但系统注入了包括天气、音乐、邮件等 50 个 skills 的描述，其中只有 3 个与飞书相关。

### 解决方案

ISS (Intelligent Skill Selection) 通过**向量相似度检索**，实现：

- ✅ **按需召回**：只注入与用户问题最相关的 3-5 个 skills
- ✅ **Token 节省**：从 ~2000 tokens 降至 ~200 tokens（**90% 节省**）
- ✅ **成本降低**：减少 90% 的 embedding 和 prompt tokens 费用
- ✅ **响应加速**：更短的 prompt，更快的模型响应
- ✅ **精准匹配**：基于语义相似度，而非简单的关键词匹配

**同样的例子**：用户询问"帮我查飞书文档"，ISS 只注入 `feishu-doc`、`feishu-wiki`、`feishu-drive` 这 3 个相关 skills。

---

## 🔄 工作流程

ISS 分为**离线准备**和**运行时召回**两个阶段：

### 阶段 1：离线向量化（vectorize-skills）

**目的**：将所有 skills 转换为向量并存储，为运行时召回做准备。

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 扫描 Skills                                        │
│  ├── ~/.openclaw/workspace/skills/     (workspace skills)   │
│  ├── ~/.openclaw/skills/                (managed skills)    │
│  └── /usr/lib/.../skills/               (bundled skills)    │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: 提取 Skill 信息                                    │
│  对每个 SKILL.md 提取：                                     │
│  ├── name: skill 名称（如 "feishu-doc"）                    │
│  ├── description: 功能描述                                  │
│  ├── keywords: 关键词列表                                   │
│  └── location: 文件路径                                     │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 使用 Amazon Nova MME 向量化                       │
│  模型：amazon.nova-2-multimodal-embeddings-v1:0             │
│  输入："{name} {description} {keywords}"                    │
│  输出：1024 维向量 [0.123, -0.456, 0.789, ...]             │
│  耗时：~250ms per skill                                     │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 存储到 S3 Vectors                                  │
│  位置：s3://openclaw-skills-vectors/skills/                 │
│  格式：{skill_name}.json                                    │
│  内容：{                                                    │
│    "skill_name": "feishu-doc",                              │
│    "description": "...",                                    │
│    "vector": [1024维向量],                                  │
│    "metadata": {...}                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

**关键特性**：
- **增量更新**（v2.0）：只向量化新增或修改的 skills，节省 90% 时间和成本
- **智能跳过**：自动检测未修改的 skills（通过比较文件 mtime）
- **灵活触发**：手动运行，按需更新（添加新 skill 或修改描述后）

**运行方式**：
```bash
cd ~/.openclaw/skills/vectorize-skills
npm run vectorize           # 增量更新（默认）
npm run vectorize:force     # 强制全量更新
```

---

### 阶段 2：运行时召回（ISS Hook）

**目的**：在用户发送消息时，实时召回最相关的 skills 并注入到 prompt。

```
┌─────────────────────────────────────────────────────────────┐
│  用户发送消息                                               │
│  "帮我查飞书文档"                                           │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 1: ISS Hook 拦截消息                                  │
│  事件：message:preprocessed                                 │
│  （在媒体/链接理解后，发送给 Agent 前）                     │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: 向量化用户查询                                     │
│  使用同样的 Nova MME 模型                                   │
│  输入：用户消息 "帮我查飞书文档"                            │
│  输出：查询向量 [0.234, -0.567, 0.890, ...]                │
│  耗时：~150ms                                               │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 从 S3 加载所有 skill 向量                          │
│  读取 s3://openclaw-skills-vectors/skills/*.json            │
│  缓存：预加载（10分钟 TTL），避免每次都请求 S3              │
│  耗时：~50ms（缓存命中）或 ~100ms（缓存未命中）             │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 计算余弦相似度                                     │
│  对每个 skill 向量：                                        │
│    similarity = cosine(查询向量, skill向量)                 │
│  结果：                                                     │
│    feishu-doc: 0.662                                        │
│    feishu-wiki: 0.584                                       │
│    feishu-drive: 0.523                                      │
│    weather: 0.123                                           │
│    music: 0.089                                             │
│    ...                                                      │
│  耗时：~5ms（客户端计算，6 个 skills）                      │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 5: 过滤 + 排序 + Top-K                                │
│  - 过滤：只保留相似度 >= 阈值（默认 0.2）的 skills          │
│  - 排序：按相似度降序                                       │
│  - Top-K：取前 3 个（可配置）                               │
│  结果：                                                     │
│    1. feishu-doc (0.662)                                    │
│    2. feishu-wiki (0.584)                                   │
│    3. feishu-drive (0.523)                                  │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 6: 构建 <available_skills> XML 块                     │
│  <available_skills>                                         │
│    <skill>                                                  │
│      <name>feishu-doc</name>                                │
│      <description>Fetch content from Feishu...</description>│
│      <location>/path/to/skill</location>                    │
│    </skill>                                                 │
│    <skill>                                                  │
│      <name>feishu-wiki</name>                               │
│      ...                                                    │
│    </skill>                                                 │
│    <skill>                                                  │
│      <name>feishu-drive</name>                              │
│      ...                                                    │
│    </skill>                                                 │
│  </available_skills>                                        │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 7: 注入到消息                                         │
│  修改后的消息：                                             │
│    <available_skills>...</available_skills>                 │
│                                                             │
│    帮我查飞书文档                                           │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 8: OpenClaw Agent 处理                                │
│  Agent 看到：                                               │
│  - 用户问题："帮我查飞书文档"                               │
│  - 可用 skills：feishu-doc, feishu-wiki, feishu-drive      │
│  Agent 决策：使用 feishu-doc 工具                           │
│  执行并回复用户                                             │
└─────────────────────────────────────────────────────────────┘
```

**性能指标**：
- **总延迟**：~200-250ms（对用户响应时间影响很小）
  - 向量化查询：~150ms
  - S3 加载：~50-100ms
  - 相似度计算：~5ms
  - 构建注入：~1ms
- **Token 节省**：从 ~2000 降至 ~200（**90% 节省**）
- **准确率**：高（基于语义相似度，而非关键词）

**自动化**：
- ✅ **完全自动**：用户发送任何消息都会触发
- ✅ **透明执行**：用户和 Agent 无感知
- ✅ **无需配置**：安装后即可工作

---

## 🏗️ 整体架构

### 系统架构图

```
┌──────────────────────── 离线阶段 ─────────────────────────┐
│                                                            │
│  ┌─────────────────────────────────────┐                  │
│  │  vectorize-skills (独立工具)        │                  │
│  │  ~/.openclaw/skills/vectorize-skills│                  │
│  │                                     │                  │
│  │  ├── vectorize-skills.js            │                  │
│  │  │   (主脚本，增量更新逻辑)          │                  │
│  │  ├── package.json                   │                  │
│  │  │   (独立依赖：@aws-sdk/*)         │                  │
│  │  └── node_modules/                  │                  │
│  │      (独立安装的依赖)                │                  │
│  │                                     │                  │
│  │  功能：                              │                  │
│  │  • 扫描所有 skills 目录              │                  │
│  │  • 提取 description + keywords      │                  │
│  │  • 调用 Nova MME 向量化             │                  │
│  │  • 存储到 S3 Vectors                │                  │
│  │  • 增量更新（智能跳过未修改）        │                  │
│  └─────────────────────────────────────┘                  │
│                    ↓ 写入                                  │
│  ┌─────────────────────────────────────┐                  │
│  │  Amazon S3 Vectors (向量存储)       │                  │
│  │  s3://openclaw-skills-vectors/      │                  │
│  │                                     │                  │
│  │  skills/                            │                  │
│  │  ├── feishu-doc.json                │                  │
│  │  │   {skill_name, description,      │                  │
│  │  │    vector: [1024D], ...}         │                  │
│  │  ├── feishu-wiki.json               │                  │
│  │  ├── feishu-drive.json              │                  │
│  │  ├── security-audit.json            │                  │
│  │  └── ... (所有已向量化的 skills)     │                  │
│  └─────────────────────────────────────┘                  │
│                                                            │
└────────────────────────────────────────────────────────────┘

                        ↓ 读取

┌──────────────────────── 运行时阶段 ───────────────────────┐
│                                                            │
│  ┌─────────────────────────────────────┐                  │
│  │  用户                                │                  │
│  │  Feishu / Telegram / Discord / ...  │                  │
│  └─────────────────────────────────────┘                  │
│                    ↓ 发送消息                              │
│  ┌─────────────────────────────────────┐                  │
│  │  OpenClaw Gateway                   │                  │
│  │  消息处理 Pipeline                   │                  │
│  └─────────────────────────────────────┘                  │
│                    ↓ message:preprocessed 事件             │
│  ┌─────────────────────────────────────┐                  │
│  │  ISS Hook (消息拦截器)               │                  │
│  │  ~/.openclaw/hooks/iss/             │                  │
│  │                                     │                  │
│  │  ├── HOOK.md (元数据)                │                  │
│  │  │   events: [message:preprocessed] │                  │
│  │  └── handler.ts (拦截逻辑)           │                  │
│  │                                     │                  │
│  │  功能：                              │                  │
│  │  • 提取用户消息                      │                  │
│  │  • 调用 skill-retriever 检索        │                  │
│  │  • 构建 <available_skills> 块       │                  │
│  │  • 注入到消息                        │                  │
│  └─────────────────────────────────────┘                  │
│                    ↓ 调用                                  │
│  ┌─────────────────────────────────────┐                  │
│  │  ISS Extension (核心召回逻辑)        │                  │
│  │  ~/.openclaw/extensions/openclaw-iss│                  │
│  │                                     │                  │
│  │  ├── skill-retriever.js             │                  │
│  │  │   (核心召回算法)                  │                  │
│  │  │   • 向量化查询 (Nova MME)         │                  │
│  │  │   • 从 S3 加载 skills             │                  │
│  │  │   • 余弦相似度计算                │                  │
│  │  │   • 过滤 + 排序 + Top-K           │                  │
│  │  │   • LRU 缓存（100条，1小时TTL）   │                  │
│  │  ├── config.json (配置)              │                  │
│  │  └── package.json (依赖)             │                  │
│  └─────────────────────────────────────┘                  │
│                    ↓ 返回相关 skills                       │
│  ┌─────────────────────────────────────┐                  │
│  │  OpenClaw Agent                     │                  │
│  │  (Claude / GPT / Gemini / ...)      │                  │
│  │                                     │                  │
│  │  接收：                              │                  │
│  │  • 用户问题                          │                  │
│  │  • 3-5 个相关 skills（~200 tokens） │                  │
│  │                                     │                  │
│  │  决策：选择合适的 skill/tool         │                  │
│  │  执行：调用工具并生成回复            │                  │
│  └─────────────────────────────────────┘                  │
│                    ↓ 回复                                  │
│  ┌─────────────────────────────────────┐                  │
│  │  用户                                │                  │
│  │  收到回复                            │                  │
│  └─────────────────────────────────────┘                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 位置 | 职责 | 触发方式 |
|------|------|------|----------|
| **vectorize-skills** | `~/.openclaw/skills/vectorize-skills/` | 离线向量化所有 skills | 手动运行（添加/修改 skill 后） |
| **ISS Hook** | `~/.openclaw/hooks/iss/` | 拦截消息，触发召回 | 自动（每条用户消息） |
| **ISS Extension** | `~/.openclaw/extensions/openclaw-iss/` | 核心召回算法（向量化 + 相似度计算） | 被 ISS Hook 调用 |
| **S3 Vectors** | `s3://openclaw-skills-vectors/` | 持久化存储向量数据 | 读/写（离线 + 运行时） |

### 数据流

```
离线：Skills → vectorize-skills → Nova MME → S3 Vectors
运行时：用户消息 → ISS Hook → ISS Extension → S3 Vectors → 余弦相似度 → Top-K Skills → 注入 → Agent
```

### 技术栈

- **向量化模型**：Amazon Nova MME (amazon.nova-2-multimodal-embeddings-v1:0)
- **向量维度**：1024D
- **向量存储**：Amazon S3 + 客户端搜索（S3 Vectors API 可选）
- **相似度算法**：余弦相似度（Cosine Similarity）
- **缓存**：LRU (最多 100 条，TTL 1 小时)
- **集成方式**：OpenClaw Internal Hooks System

---

## 🎯 功能特性

- **智能召回**：基于 Amazon Nova MME 向量化和余弦相似度
- **增量更新**：只向量化新增或修改的 skills（节省 90% 成本）
- **无侵入式**：通过 message hook 集成，不修改 OpenClaw 核心代码
- **高性能**：检索延迟 ~200-250ms，缓存命中 ~50ms
- **自动化**：用户消息自动触发召回，无需手动干预
- **可配置**：Top-K、阈值、缓存等参数均可调整

## 📦 组件说明

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
| Token 节省 | 理论 75-90% |
| 向量化速度 | ~250ms per skill |
| 缓存命中延迟 | ~50ms |

### 增量更新性能（vectorize-skills v2.0）

| 场景 | v1.0 (全量) | v2.0 (增量) | 改善 |
|------|------------|------------|------|
| 首次运行 | 2.5s | 2.5s | 0% |
| 无修改 | 2.5s | 0.2s | **92%** ✅ |
| 1个修改 | 2.5s | 0.45s | **82%** ✅ |
| 成本 | $0.001 | $0.0001 | **90%** ✅ |

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

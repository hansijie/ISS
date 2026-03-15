---
name: iss
description: "Intelligent Skill Selection - 智能召回相关 skills 并动态注入到 system prompt"
homepage: https://github.com/openclaw/openclaw-iss
metadata:
  openclaw:
    emoji: "🎯"
    events: ["message:preprocessed"]
    requires:
      bins: ["node"]
      env: ["OPENCLAW_SKILLS_VECTOR_BUCKET"]
      config: []
---

# ISS Hook - Intelligent Skill Selection

## 功能

在消息预处理阶段拦截用户输入，使用向量相似度搜索召回最相关的 skills，并动态注入到 context 中。

## 工作原理

1. **消息拦截**：监听 `message:preprocessed` 事件
2. **向量化查询**：使用 Amazon Nova MME 将用户消息转换为向量
3. **S3 召回**：从 S3 Vectors 中检索 top-K 相关 skills
4. **动态注入**：构建 `<available_skills>` 块并注入到消息中

## 前置要求

- ✅ 已运行 `vectorize-skills` 向量化所有 skills
- ✅ S3 桶中存在 skills 向量数据
- ✅ 配置了 AWS credentials
- ✅ 设置了环境变量：`OPENCLAW_SKILLS_VECTOR_BUCKET`

## 配置

环境变量：
- `OPENCLAW_SKILLS_VECTOR_BUCKET` - S3 桶名称（必需）
- `AWS_REGION` - AWS 区域（默认：us-east-1）
- `ISS_TOP_K` - 召回 skills 数量（默认：3）
- `ISS_THRESHOLD` - 相似度阈值（默认：0.2）
- `ISS_ENABLED` - 启用/禁用（默认：true）

配置文件：`~/.openclaw/extensions/openclaw-iss/config.json`

```json
{
  "enabled": true,
  "s3Bucket": "openclaw-skills-vectors",
  "awsRegion": "us-east-1",
  "topK": 3,
  "threshold": 0.2,
  "cacheEnabled": true,
  "cacheTTL": 3600
}
```

## 日志示例

```
🎯 ISS: Retrieving skills for: "帮我查飞书文档"
   ✅ Found 3 relevant skill(s):
      1. feishu-doc (score: 0.662)
      2. feishu-wiki (score: 0.584)
      3. feishu-drive (score: 0.523)
   ⏱️  Retrieval time: 235ms
   ✅ Skills injected
```

## 性能

- **检索延迟**: ~200-250ms
- **Token 节省**: 90% (2000 → 200)
- **缓存命中**: 可显著降低延迟

## 故障排查

### Hook 未触发

检查 hook 是否已启用：
```bash
openclaw hooks list | grep iss
```

启用 hook：
```bash
openclaw hooks enable iss
```

### 未找到相关 skills

可能原因：
1. Skills 尚未向量化（运行 `vectorize-skills`）
2. 相似度阈值太高（降低 `ISS_THRESHOLD`）
3. S3 桶中没有数据

### AWS 权限错误

确保 IAM 角色/用户有以下权限：
- `s3:GetObject` - 读取向量数据
- `s3:ListBucket` - 列出 skills
- `bedrock:InvokeModel` - 调用 Nova MME

## 禁用其他 Skills

ISS 的核心理念是**按需加载**，因此需要禁用 OpenClaw 默认的全量 skills 注入。

在 `~/.openclaw/openclaw.json` 中：

```json
{
  "skills": {
    "allowBundled": ["vectorize-skills"]
  }
}
```

这样只允许 `vectorize-skills` skill（用于离线向量化），其他 skills 由 ISS 动态召回。

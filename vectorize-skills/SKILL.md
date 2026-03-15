---
name: vectorize-skills
description: "向量化所有 OpenClaw skills 并保存到 S3 Vectors。用于 ISS (Intelligent Skill Selection) 系统的离线准备工作。支持增量更新。"
user-invocable: false
metadata: {"openclaw": {"emoji": "🔢", "requires": {"bins": ["node"], "env": ["OPENCLAW_SKILLS_VECTOR_BUCKET"]}}}
---

# Vectorize Skills v2.0

## 功能

**独立的离线向量化工具**，扫描所有 OpenClaw skills（bundled + managed + workspace）并将其向量化保存到 Amazon S3 Vectors。

**v2.0 新功能：**
- ✅ **增量更新** - 只向量化新增或修改的 skills（默认）
- ✅ **智能跳过** - 自动检测未修改的 skills，节省时间和成本
- ✅ **强制全量更新** - 可选 `--force` 选项重新处理所有 skills
- ✅ **指定 skills** - 可以只向量化特定的 skills

这是 **ISS (Intelligent Skill Selection)** 系统的准备步骤。向量化后，ISS hook 可以在运行时快速召回相关 skills。

## 使用方法

### 方式 1：增量更新（推荐，日常使用）

```bash
cd ~/.openclaw/skills/vectorize-skills
npm run vectorize
```

**行为：**
- ✅ 只处理新增的 skills
- ✅ 只处理修改过的 skills（SKILL.md 更新后）
- ✅ 跳过未修改的 skills
- ✅ 节省时间和 API 调用成本

**输出示例：**
```
📦 Checking: feishu-doc
   ⏭️  Unchanged (skipped)

📦 Checking: new-skill
   ✨ New skill, vectorizing...
   ✅ Success!

📊 Summary:
   ✅ Processed: 1
   ⏭️  Skipped (unchanged): 5
```

### 方式 2：强制全量更新

```bash
cd ~/.openclaw/skills/vectorize-skills
npm run vectorize:force
```

或：

```bash
npm run vectorize -- --force
```

**用途：**
- 首次安装 ISS
- 重建整个向量索引
- S3 数据损坏需要恢复

### 方式 3：只处理指定 skills

```bash
npm run vectorize -- feishu-doc feishu-wiki
```

**用途：**
- 调试特定 skill
- 快速更新单个 skill

### 方式 4：使用包装脚本

```bash
~/.openclaw/skills/vectorize-skills/vectorize.sh
```

### 首次使用

首次运行会自动安装依赖（@aws-sdk/client-s3, @aws-sdk/client-bedrock-runtime）。

## 工作流程

1. 扫描所有 skills 目录（bundled + managed + workspace）
2. 读取每个 SKILL.md，提取 description 和 keywords
3. 使用 **Amazon Nova MME** (amazon.nova-2-multimodal-embeddings-v1:0) 生成 1024 维向量
4. 保存到 S3：`s3://${BUCKET}/skills/${skillName}.json`

## 配置

### 环境变量（必需）

- `OPENCLAW_SKILLS_VECTOR_BUCKET` - S3 桶名称（例如：openclaw-skills-vectors）
- `AWS_REGION` - AWS 区域（例如：us-east-1）

### 可选配置

在 `~/.openclaw/extensions/openclaw-iss/config.json` 中：

```json
{
  "s3Bucket": "openclaw-skills-vectors",
  "awsRegion": "us-east-1",
  "embeddingModel": "amazon.nova-2-multimodal-embeddings-v1:0",
  "embeddingDimension": 1024
}
```

## 输出示例

```
🔢 Vectorizing OpenClaw Skills...
   S3 Bucket: openclaw-skills-vectors
   Region: us-east-1
   Model: amazon.nova-2-multimodal-embeddings-v1:0

Scanning skills directories...
   ✓ Found 12 skills

Vectorizing skills:
   1/12 feishu-doc ...................... ✓ (234ms)
   2/12 feishu-drive .................... ✓ (221ms)
   3/12 feishu-wiki ..................... ✓ (218ms)
   ...

Summary:
   ✓ Vectorized: 12 skills
   ✗ Failed: 0 skills
   ⏱️ Total time: 2.8s
   📦 S3 objects: 12 files (156 KB)
```

## 何时运行

- **首次安装 ISS 后**：必须运行一次
- **添加新 skill 后**：重新运行以向量化新 skill
- **修改 skill 描述后**：重新运行以更新向量

## 故障排查

### "AWS credentials not found"

确保配置了 AWS credentials：
```bash
aws configure
# 或设置环境变量
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx
```

### "Bucket does not exist"

创建 S3 桶：
```bash
aws s3 mb s3://openclaw-skills-vectors --region us-east-1
```

### "NoSuchKey: skills/xxx.json"

正常情况。首次运行时 S3 桶是空的，脚本会创建这些文件。

## 相关文档

- [ISS 设计文档](~/.openclaw/extensions/openclaw-iss/README.md)
- [S3 Vectors API](https://docs.aws.amazon.com/AmazonS3/latest/userguide/S3-Vectors.html)
- [Amazon Nova Embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/embeddings.html)

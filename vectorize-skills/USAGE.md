# Vectorize Skills v2.0 - 使用指南

## 🎯 概述

vectorize-skills v2.0 是一个**智能增量更新**工具，只向量化新增或修改的 skills，大幅节省时间和成本。

## 🚀 快速开始

### 日常使用（推荐）

```bash
cd ~/.openclaw/skills/vectorize-skills
npm run vectorize
```

**预期行为：**
- ✅ 检查所有 skills
- ✅ 只处理新的或修改的
- ✅ 跳过未修改的
- ⏱️ 耗时：0.1-0.5s（跳过时）

**示例输出：**
```
📦 Checking: feishu-doc
   ⏭️  Unchanged (skipped)

📦 Checking: new-skill
   ✨ New skill, vectorizing...
   ✅ Success!

📊 Summary:
   ✅ Processed: 1
   ⏭️  Skipped: 5
   ⏱️  Time: 1.2s
```

## 📋 使用场景

### 场景 1：首次安装 ISS

```bash
npm run vectorize:force
```

或：
```bash
npm run vectorize -- --force
```

**说明：**
- 强制处理所有 skills
- 建立完整的向量索引
- 耗时：~10-30s（取决于 skills 数量）

### 场景 2：添加新 skill

```bash
# 添加新 skill 后
npm run vectorize
```

**说明：**
- 自动检测新 skill
- 只向量化新的
- 其他 skills 保持不变

### 场景 3：修改 skill 描述

```bash
# 编辑 SKILL.md 后
npm run vectorize
```

**说明：**
- 自动检测 SKILL.md 修改时间
- 只重新向量化修改的 skill
- 其他 skills 保持不变

### 场景 4：调试特定 skill

```bash
npm run vectorize -- feishu-doc
```

**说明：**
- 只处理指定的 skill
- 无论是否修改都会处理
- 快速验证单个 skill

### 场景 5：重建索引

```bash
npm run vectorize:force
```

**用途：**
- S3 数据损坏
- 更换嵌入模型
- 更新向量格式

## ⚙️ 命令行选项

### 增量更新（默认）

```bash
npm run vectorize
```

- ✅ 智能跳过未修改的
- ✅ 节省时间和成本
- ✅ 适合日常使用

### 强制全量更新

```bash
npm run vectorize:force
# 或
npm run vectorize -- --force
```

- ⚡ 重新处理所有 skills
- ⚡ 忽略修改时间
- ⚡ 适合首次安装或重建索引

### 指定 skills

```bash
npm run vectorize -- skill1 skill2 skill3
```

- 🎯 只处理指定的 skills
- 🎯 支持多个 skill
- 🎯 适合调试或快速更新

### 组合使用

```bash
npm run vectorize -- --force skill1 skill2
```

- 强制更新指定的 skills
- 无论是否修改都会处理

## 📊 性能对比

### v1.0（全量更新）

```
10 skills × 250ms = 2.5s
每次都要处理所有 skills
```

### v2.0（增量更新）

```
首次：10 skills × 250ms = 2.5s
后续（无修改）：0.2s（检查时间）
后续（1个修改）：0.2s + 250ms = 0.45s

节省时间：90%+
节省成本：90%+
```

## 💰 成本估算

### Nova MME 定价

- 每次向量化：~$0.0001
- 1000 次：~$0.10

### 成本对比

**全量更新（10 skills）：**
- v1.0：每次 $0.001
- 每天运行 10 次：$0.01/天 = $3.65/年

**增量更新（10 skills，1个修改）：**
- v2.0：每次 $0.0001
- 每天运行 10 次：$0.001/天 = $0.365/年
- **节省 90%**

## 🔍 工作原理

### 增量检测逻辑

```javascript
for (const skill in skills) {
  // 1. 检查 S3 中是否存在向量
  const existingVector = await getExistingVector(skill);
  
  if (!existingVector.exists) {
    // 新 skill，需要向量化
    vectorize(skill);
    continue;
  }
  
  // 2. 比较修改时间
  const localModified = fs.stat(skill).mtime;
  const s3Modified = existingVector.lastModified;
  
  if (localModified > s3Modified) {
    // 本地文件更新，需要重新向量化
    vectorize(skill);
  } else {
    // 未修改，跳过
    skip(skill);
  }
}
```

### 修改检测

- ✅ 使用文件系统 `mtime`（修改时间）
- ✅ 与 S3 对象的 `LastModified` 比较
- ✅ 毫秒级精度
- ✅ 可靠且高效

## 🚨 故障排查

### 问题 1：所有 skills 都被跳过，但我刚修改了

**原因：**
- 文件保存时间可能早于 S3 上传时间
- 或者文件系统时间不同步

**解决：**
```bash
# 强制更新该 skill
npm run vectorize -- --force your-skill
```

### 问题 2：想重新处理所有 skills

**解决：**
```bash
npm run vectorize:force
```

### 问题 3：增量更新太慢

**原因：**
- S3 HeadObject API 调用有延迟
- 对于大量 skills（100+），检查时间可能较长

**解决：**
- 使用指定 skills 模式
- 或等待未来优化（批量 HeadObject）

### 问题 4：向量化失败但无法重试

**解决：**
```bash
# 删除 S3 中的向量文件，强制重新处理
aws s3 rm s3://openclaw-skills-vectors/skills/failed-skill.json

# 重新运行
npm run vectorize
```

## 📈 未来优化

### v2.1（计划中）

- [ ] 批量 S3 HeadObject（减少 API 调用）
- [ ] 本地缓存修改时间（加速检查）
- [ ] 并行向量化（多个 skills 同时处理）
- [ ] 进度条显示（长时间运行）

### v3.0（考虑中）

- [ ] 增量向量搜索（无需下载所有向量）
- [ ] 向量数据库集成（LanceDB/Pinecone）
- [ ] 多租户支持（多个 workspaces）

## 📚 相关文档

- [ISS 架构文档](../ARCHITECTURE.md)
- [ISS Hook 使用指南](../../../hooks/iss/HOOK.md)
- [Amazon Nova Embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/embeddings.html)
- [S3 Vectors API](https://docs.aws.amazon.com/AmazonS3/latest/userguide/S3-Vectors.html)

---

**版本**: v2.0.0  
**更新日期**: 2026-03-15  
**维护者**: ISS Team

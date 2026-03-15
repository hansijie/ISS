# Vectorize Skills v2.0 - Release Notes

## 🎉 新功能

### 增量更新（核心特性）

**问题：** v1.0 每次都重新向量化所有 skills，浪费时间和成本

**解决：** v2.0 智能检测修改，只处理新增或更新的 skills

**效果：**
- ⚡ 速度提升 90%+（日常使用）
- 💰 成本降低 90%+（API 调用）
- 🎯 更智能的工作流

### 强制全量更新

**用途：**
- 首次安装 ISS
- 重建向量索引
- S3 数据恢复

**使用：**
```bash
npm run vectorize:force
```

### 指定 Skills

**用途：**
- 调试特定 skill
- 快速更新单个 skill
- 批量更新部分 skills

**使用：**
```bash
npm run vectorize -- skill1 skill2
```

## 📊 性能对比

### v1.0（全量更新）

```
场景：10 skills，每天运行 10 次
- 每次耗时：2.5s
- 每次成本：$0.001
- 年度成本：$3.65
```

### v2.0（增量更新）

```
场景：10 skills，每天运行 10 次，平均 1 个修改
- 首次耗时：2.5s
- 后续耗时：0.2-0.5s（90% 节省）
- 每次成本：$0.0001（90% 节省）
- 年度成本：$0.365
```

**总结：时间节省 90%，成本节省 90%** ✅

## 🔧 技术实现

### 增量检测算法

```
1. 从 S3 获取现有向量的元数据（HeadObject）
2. 比较本地 SKILL.md 的修改时间（mtime）
3. 如果本地文件更新 → 重新向量化
4. 如果未修改 → 跳过
```

### 关键 API

- `S3Client.HeadObjectCommand` - 检查向量是否存在
- `fs.stat()` - 获取本地文件修改时间
- 比较 `stats.mtime` vs `LastModified`

### 数据流

```
┌─────────────┐
│  SKILL.md   │  mtime: 2026-03-15 10:00
└─────────────┘
       ↓
    检查 S3
       ↓
┌─────────────────────────────┐
│ skills/feishu-doc.json      │
│ LastModified: 2026-03-14    │
└─────────────────────────────┘
       ↓
  mtime > LastModified?
       ↓
     YES → 重新向量化
      NO → 跳过
```

## 🎯 使用场景

### 日常开发（推荐）

```bash
# 修改了某个 skill 的描述
vim ~/.openclaw/workspace/skills/my-skill/SKILL.md

# 增量更新（只处理修改的）
npm run vectorize

# 输出：
# ✅ Processed: 1 (my-skill)
# ⏭️  Skipped: 9 (unchanged)
```

### 首次安装

```bash
# 初始化 ISS
npm run vectorize:force

# 输出：
# ✅ Processed: 10 (all skills)
```

### 添加新 Skill

```bash
# 添加新 skill
mkdir ~/.openclaw/workspace/skills/new-skill
vim ~/.openclaw/workspace/skills/new-skill/SKILL.md

# 自动检测新 skill
npm run vectorize

# 输出：
# ✨ New skill: new-skill
# ✅ Processed: 1
# ⏭️  Skipped: 9
```

## 🚀 升级指南

### 从 v1.0 升级

1. **更新文件**
   ```bash
   cd ~/.openclaw/skills/vectorize-skills
   # 文件已自动更新
   ```

2. **首次运行（可选）**
   ```bash
   # v1.0 的向量数据仍然有效
   # 可以直接使用增量模式
   npm run vectorize
   ```

3. **验证**
   ```bash
   # 应该看到所有 skills 都被跳过（unchanged）
   # 因为向量数据已经存在
   ```

### 兼容性

- ✅ 向后兼容 v1.0 的 S3 数据格式
- ✅ 不需要重新向量化现有 skills
- ✅ 可以直接开始使用增量模式

## 📝 变更日志

### v2.0.0 (2026-03-15)

**新增：**
- ✅ 增量更新（默认行为）
- ✅ `--force` 选项（强制全量更新）
- ✅ 指定 skills 功能
- ✅ 智能修改检测
- ✅ 详细的统计信息

**优化：**
- ⚡ 90%+ 性能提升（日常使用）
- 💰 90%+ 成本降低
- 📊 更好的日志输出
- 🎯 更精确的状态报告

**修复：**
- 无（v1.0 工作正常）

### v1.0.0 (2026-03-14)

**初始版本：**
- ✅ 基础向量化功能
- ✅ S3 Vectors 存储
- ✅ Nova MME 集成

## 🔮 未来计划

### v2.1（近期）

- [ ] 并行向量化（加速全量更新）
- [ ] 本地缓存（减少 S3 API 调用）
- [ ] 进度条（长时间运行反馈）
- [ ] 批量 HeadObject（优化检查速度）

### v3.0（长期）

- [ ] 向量数据库集成（LanceDB/Pinecone）
- [ ] 增量向量搜索（无需下载所有向量）
- [ ] 多租户支持
- [ ] 自动触发（文件监听）

## 📚 文档

- [使用指南](USAGE.md) - 详细的使用说明
- [ISS 架构](~/.openclaw/extensions/openclaw-iss/ARCHITECTURE.md) - 整体架构
- [ISS Hook](~/.openclaw/hooks/iss/HOOK.md) - Hook 使用

## 🙏 致谢

感谢 OpenClaw 社区的反馈和建议。

---

**版本**: v2.0.0  
**发布日期**: 2026-03-15  
**作者**: ISS Team

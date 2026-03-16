#!/usr/bin/env node
/**
 * OpenClaw Skills 离线向量化工具 v2.0
 * 
 * 功能：批量处理 OpenClaw 的所有 skills，向量化后存储到 S3 Vectors
 * 
 * 使用方式：
 *   npm run vectorize           # 增量更新（只处理新增/修改的）
 *   npm run vectorize -- --force  # 强制全量更新
 *   npm run vectorize -- skill-name1 skill-name2  # 只处理指定 skills
 * 
 * 环境变量：
 * - OPENCLAW_SKILLS_VECTOR_BUCKET: S3 Vectors 向量桶名称（必需）
 * - OPENCLAW_SKILLS_VECTOR_INDEX: S3 Vectors 向量索引名称（默认 skills）
 * - OPENCLAW_SKILLS_GP_BUCKET: S3 通用桶名称（如果在该区域 S3 Vectors 服务还未上线）
 * - OPENCLAW_SKILLS_USE_S3_VECTORS_BUCKET: 是否启用 S3 Vectors - true | false
 * - AWS_REGION: AWS 区域（默认 us-east-1）
 * - OPENCLAW_SKILLS_DIR: Skills 目录（默认 ~/.openclaw/workspace/skills）
 */

const fs = require('fs').promises;
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { S3VectorsClient, PutVectorsCommand, GetVectorsCommand, ListVectorsCommand } = require('@aws-sdk/client-s3vectors');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// 解析命令行参数
const args = process.argv.slice(2);
const forceUpdate = args.includes('--force');
const specificSkills = args.filter(arg => !arg.startsWith('--'));

// 配置
const SKILLS_DIR = process.env.OPENCLAW_SKILLS_DIR || path.join(process.env.HOME, '.openclaw/workspace/skills');
const GP_BUCKET = process.env.OPENCLAW_SKILLS_GP_BUCKET || 'openclaw-skills-vectors';
const VECTOR_BUCKET = process.env.OPENCLAW_SKILLS_VECTOR_BUCKET || 'openclaw-skills-vectors';
const VECTOR_INDEX = process.env.OPENCLAW_SKILLS_VECTOR_INDEX || 'skills';
const USE_S3V = process.env.OPENCLAW_SKILLS_USE_S3_VECTORS_BUCKET || false;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const NOVA_MME_MODEL = 'amazon.nova-2-multimodal-embeddings-v1:0';

// AWS 客户端
const s3Client = new S3Client({ region: AWS_REGION });
const s3VectorsClient = new S3VectorsClient({ region: AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });

/**
 * 检查 S3 中是否存在向量文件，并获取元数据
 */
async function getExistingVectorGpBucket(skillName) {
  try {
    const response = await s3Client.send(new HeadObjectCommand({
      Bucket: GP_BUCKET,
      Key: `skills/${skillName}.json`
    }));
    
    return {
      exists: true,
      lastModified: response.LastModified,
      metadata: response.Metadata
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * 检查 S3 Vectors 中是否存在向量文件，并获取元数据
 */
async function getExistingVectorS3VBucket(skillName) {
  try {
    const response = await s3VectorsClient.send(new GetVectorsCommand({
      vectorBucketName: VECTOR_BUCKET,
      indexName: VECTOR_INDEX,
      keys: [skillName],
      returnMetadata: true
    }));

    if (response.vectors && response.vectors.length > 0 && response.vectors[0].key) {
      const metadata = response.vectors[0].metadata || {};
      return {
        exists: true,
        vectorizedAt: metadata.vectorized_at || null,
        metadata
      };
    }
    return { exists: false };
  } catch (error) {
    if (error.name === 'ResourceNotFoundException' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * 检查 SKILL.md 是否被修改
 */
async function isSkillModified(skillMdPath, existingVector) {
  if (!existingVector.exists) {
    return true; // 新 skill，需要向量化
  }
  
  try {
    const stats = await fs.stat(skillMdPath);
    const localModified = stats.mtime;
    if (USE_S3V) {
      const vectorizedAt = new Date(existingVector.vectorizedAt);
      return localModified > vectorizedAt;
    } else {
      const s3Modified = existingVector.lastModified;
    
      // 如果本地文件比 S3 文件新，则需要更新
      return localModified > s3Modified;
    }
  } catch (error) {
    console.error(`     ⚠️  Error checking modification time: ${error.message}`);
    return true; // 出错时保守处理，重新向量化
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔄 OpenClaw Skills Vectorization v2.0');
  console.log('==========================================');
  console.log(`📁 Skills directory: ${SKILLS_DIR}`);
  if (USE_S3V) {
    console.log(`☁️  S3 Vectors bucket: ${VECTOR_BUCKET}, index: ${VECTOR_INDEX}`);
  } else {
    console.log(`☁️  S3 GP bucket: ${GP_BUCKET}`);
  }
  console.log(`🌍 AWS region: ${AWS_REGION}`);
  
  if (forceUpdate) {
    console.log(`⚡ Mode: FORCE (全量更新)`);
  } else {
    console.log(`🔄 Mode: INCREMENTAL (增量更新)`);
  }
  
  if (specificSkills.length > 0) {
    console.log(`🎯 Target skills: ${specificSkills.join(', ')}`);
  }
  
  console.log('==========================================\n');
  
  try {
    // 检查 skills 目录是否存在
    await fs.access(SKILLS_DIR);
  } catch (error) {
    console.error(`❌ Error: Skills directory not found: ${SKILLS_DIR}`);
    console.error('   Please check OPENCLAW_SKILLS_DIR environment variable');
    process.exit(1);
  }
  
  // 读取所有 skill 目录
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  let skillDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  
  // 如果指定了特定 skills，只处理这些
  if (specificSkills.length > 0) {
    skillDirs = skillDirs.filter(name => specificSkills.includes(name));
    
    if (skillDirs.length === 0) {
      console.error(`❌ Error: None of the specified skills found in ${SKILLS_DIR}`);
      console.error(`   Available skills: ${entries.filter(e => e.isDirectory()).map(e => e.name).join(', ')}`);
      process.exit(1);
    }
  }
  
  console.log(`📦 Found ${skillDirs.length} skill(s) to check\n`);
  
  let processedCount = 0;
  let skippedCount = 0;
  let failCount = 0;
  let noSkillMdCount = 0;
  
  const startTime = Date.now();
  
  for (const skillName of skillDirs) {
    const skillPath = path.join(SKILLS_DIR, skillName);
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    
    // 检查是否存在 SKILL.md
    try {
      await fs.access(skillMdPath);
    } catch {
      console.log(`⏭️  ${skillName}: No SKILL.md (skipped)`);
      noSkillMdCount++;
      continue;
    }
    
    console.log(`📦 Checking: ${skillName}`);
    
    try {
      // 检查是否需要更新
      if (!forceUpdate) {
        const existingVector = USE_S3V ? await getExistingVectorS3VBucket(skillName) : await getExistingVectorGpBucket(skillName);
        
        if (existingVector.exists) {
          const modified = await isSkillModified(skillMdPath, existingVector);
          
          if (!modified) {
            console.log(`   ⏭️  Unchanged (skipped)\n`);
            skippedCount++;
            continue;
          } else {
            console.log(`   🔄 Modified, updating...`);
          }
        } else {
          console.log(`   ✨ New skill, vectorizing...`);
        }
      }
      
      // 读取 SKILL.md
      const skillMd = await fs.readFile(skillMdPath, 'utf-8');
      
      // 提取元数据
      const metadata = extractMetadata(skillMd, skillName, skillPath);
      
      if (!metadata.description) {
        console.log(`   ⚠️  Warning: No description found, using default`);
      }
      
      const descPreview = metadata.description.substring(0, 60);
      console.log(`   Description: ${descPreview}${metadata.description.length > 60 ? '...' : ''}`);
      
      // 向量化
      const text = `${metadata.name} ${metadata.description} ${metadata.keywords.join(' ')}`;
      console.log(`   🔄 Generating embedding (${text.length} chars)...`);
      
      const vector = await getEmbedding(text);
      console.log(`   ✅ Embedding generated (${vector.length}D)`);
      
      if (USE_S3V) {
        // 存储到 S3 Vectors（原生向量索引）
        console.log(`   ☁️  Uploading to S3 Vectors...`);
        await s3VectorsClient.send(new PutVectorsCommand({
          vectorBucketName: VECTOR_BUCKET,
          indexName: VECTOR_INDEX,
          vectors: [{
            key: skillName,
            data: { float32: vector },
            metadata: {
              skill_name: metadata.name,
              description: metadata.description,
              location: skillPath,
              keywords: metadata.keywords.join(','),
              version: metadata.version || '1.0.0',
              vectorized_at: new Date().toISOString()
            }
          }]
        }));
      } else {
        // 构建 S3 对象
        const skillVector = {
          skill_name: metadata.name,
          description: metadata.description,
          trigger_keywords: metadata.keywords,
          location: skillPath,
          vector: vector,
          metadata: {
            version: metadata.version || '1.0.0',
            vectorized_at: new Date().toISOString(),
            usage_count: 0
          }
        };
      
        // 存储到 S3 Vectors
        console.log(`   ☁️  Uploading to S3...`);
      
        await s3Client.send(new PutObjectCommand({
          Bucket: VECTOR_BUCKET,
          Key: `skills/${metadata.name}.json`,
          Body: JSON.stringify(skillVector),
          ContentType: 'application/json',
          Metadata: {
            'skill-name': metadata.name,
            'vector-dimensions': String(vector.length),
            'vectorized-at': new Date().toISOString()
          }
        }));
      }
      
      console.log(`   ✅ Success!\n`);
      processedCount++;
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}\n`);
      failCount++;
    }
  }
  
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // 输出汇总
  console.log('\n' + '='.repeat(50));
  console.log('📊 Vectorization Summary:');
  console.log('='.repeat(50));
  console.log(`✅ Processed: ${processedCount}`);
  console.log(`⏭️  Skipped (unchanged): ${skippedCount}`);
  console.log(`⏭️  Skipped (no SKILL.md): ${noSkillMdCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📦 Total checked: ${skillDirs.length}`);
  console.log(`⏱️  Time: ${elapsedTime}s`);
  console.log('='.repeat(50));
  
  if (processedCount > 0) {
    console.log(`\n✅ Vectorization complete! ${processedCount} skill(s) vectorized to S3.`);
  } else if (skippedCount > 0) {
    console.log(`\n✨ All skills are up-to-date! (${skippedCount} unchanged)`);
  }
  
  if (failCount > 0) {
    console.log(`\n⚠️  ${failCount} skill(s) failed. Check errors above.`);
    process.exit(1);
  }
}

/**
 * 提取 SKILL.md 的元数据
 */
function extractMetadata(skillMd, skillName, skillPath) {
  const metadata = {
    name: skillName,
    description: '',
    keywords: [skillName],
    location: skillPath,
    version: '1.0.0'
  };
  
  // 提取 YAML frontmatter
  const frontmatterMatch = skillMd.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    
    // 提取 description
    const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/);
    if (descMatch) {
      metadata.description = descMatch[1].trim();
    }
    
    // 提取 keywords (如果存在)
    const keywordsMatch = frontmatter.match(/keywords:\s*\[([^\]]+)\]/);
    if (keywordsMatch) {
      const keywords = keywordsMatch[1]
        .split(',')
        .map(k => k.trim().replace(/['"]/g, ''))
        .filter(k => k.length > 0);
      
      if (keywords.length > 0) {
        metadata.keywords = keywords;
      }
    }
    
    // 提取 version (如果存在)
    const versionMatch = frontmatter.match(/version:\s*["']?([^"'\n]+)["']?/);
    if (versionMatch) {
      metadata.version = versionMatch[1].trim();
    }
  }
  
  // 如果没有 description，尝试从内容中提取第一段
  if (!metadata.description) {
    const contentAfterFrontmatter = skillMd.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
    const firstParagraph = contentAfterFrontmatter
      .split('\n')
      .filter(line => line.trim().length > 0 && !line.trim().startsWith('#'))
      [0];
    
    if (firstParagraph) {
      metadata.description = firstParagraph.trim().substring(0, 200);
    } else {
      metadata.description = `OpenClaw skill: ${skillName}`;
    }
  }
  
  return metadata;
}

/**
 * 使用 Amazon Nova MME 生成 embedding
 */
async function getEmbedding(text) {
  const payload = {
    schemaVersion: 'nova-multimodal-embed-v1',
    taskType: 'SINGLE_EMBEDDING',
    singleEmbeddingParams: {
      embeddingPurpose: 'GENERIC_RETRIEVAL',
      embeddingDimension: 1024,
      text: {
        truncationMode: 'NONE',
        value: text
      }
    }
  };
  
  const command = new InvokeModelCommand({
    modelId: NOVA_MME_MODEL,
    body: JSON.stringify(payload),
    contentType: 'application/json'
  });
  
  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  
  return responseBody.embeddings[0].embedding;
}

// 运行
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});

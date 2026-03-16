/**
 * Skill Retriever Module
 * 
 * 功能：智能检索相关 skills
 * - 向量化用户问题
 * - S3 通用桶本地计算搜索 或者 S3 Vectors 原生查询（服务端计算，无需客户端余弦相似度）
 * - 相似度过滤
 * - 缓存管理
 */

const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { S3VectorsClient, PutVectorsCommand, GetVectorsCommand, ListVectorsCommand } = require('@aws-sdk/client-s3vectors');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

class SkillRetriever {
  /**
   * @param {Object} config 配置对象
   * @param {string} config.s3Bucket S3 通用桶名称
   * @param {string} config.vectorBucketName S3 向量桶名称
   * @param {string} config.vectorIndexName S3 向量索引名称
   * @param {boolean} config.use_s3v 是否启用 S3 向量桶
   * @param {string} config.awsRegion AWS 区域
   * @param {number} config.topK 返回 top K 个 skills
   * @param {number} config.threshold 相似度阈值
   * @param {boolean} config.cacheEnabled 是否启用缓存
   * @param {number} config.cacheTTL 缓存 TTL（秒）
   */
  constructor(config) {
    this.config = {
      s3Bucket: config.s3Bucket || 'openclaw-skills-vectors',
      vectorBucketName: config.vectorBucketName || 'openclaw-skills-vectors',
      vectorIndexName: config.vectorIndexName || 'skills',
      use_s3v: config.use_s3v || false,
      awsRegion: config.awsRegion || 'us-east-1',
      topK: config.topK || 3,
      threshold: config.threshold || 0.6,
      cacheEnabled: config.cacheEnabled !== false,
      cacheTTL: config.cacheTTL || 3600,
      embeddingModel: 'amazon.nova-2-multimodal-embeddings-v1:0'
    };
    
    this.s3Client = new S3Client({ region: this.config.awsRegion });
    this.s3VectorsClient = new S3VectorsClient({ region: this.config.awsRegion });
    this.bedrockClient = new BedrockRuntimeClient({ region: this.config.awsRegion });
    
    // 内存缓存
    this.cache = new Map();
    this.skillsCache = null;
    this.skillsCacheTime = null;
  }
  
  /**
   * 初始化（预加载 skills 列表）
   */
  async init() {
    if (this.config.use_s3v) return; // skip if use s3v
    try {
      await this.loadSkillsList();
      console.log(`✅ ISS: Loaded ${this.skillsCache ? this.skillsCache.length : 0} skills from S3`);
    } catch (error) {
      console.warn(`⚠️  ISS: Failed to load skills list: ${error.message}`);
      // 不抛出异常，允许延迟加载
    }
  }
  
  /**
   * 加载所有 skills 列表（用于客户端向量搜索）
   */
  async loadSkillsList() {
    const now = Date.now();
    
    // 缓存有效期：10 分钟
    if (this.skillsCache && this.skillsCacheTime && (now - this.skillsCacheTime) < 600000) {
      return this.skillsCache;
    }
    
    const skills = [];
    let continuationToken;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: this.config.s3Bucket,
        Prefix: 'skills/',
        ContinuationToken: continuationToken
      });
      
      const response = await this.s3Client.send(command);
      
      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key.endsWith('.json')) {
            try {
              const skillData = await this.getSkillFromS3(item.Key);
              skills.push(skillData);
            } catch (error) {
              console.warn(`⚠️  ISS: Failed to load ${item.Key}: ${error.message}`);
            }
          }
        }
      }
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    this.skillsCache = skills;
    this.skillsCacheTime = now;
    
    return skills;
  }
  
  /**
   * 从 S3 获取单个 skill 数据
   */
  async getSkillFromS3(key) {
    const command = new GetObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: key
    });
    
    const response = await this.s3Client.send(command);
    const bodyString = await response.Body.transformToString();
    return JSON.parse(bodyString);
  }
  
  /**
   * 检索相关 skills
   * @param {string} userQuery 用户问题
   * @returns {Promise<Array>} 相关 skills 列表
   */
  async retrieveRelevantSkills(userQuery) {
    // 1. 检查缓存
    if (this.config.cacheEnabled) {
      const cached = this.getCached(userQuery);
      if (cached) {
        console.log(`   💾 Using cached result`);
        return cached;
      }
    }
    
    // 2. 向量化用户问题
    const queryVector = await this.getEmbedding(userQuery);
    
    let skills;
    if (this.config.use_s3v) {
      // 3. 使用 S3 Vectors 原生 QueryVectors API 进行搜索
      const results = await this.queryS3Vectors(queryVector);

      // 转换为统一格式，计算 score（将 distance 转为相似度分数）
      skills = results.map(r => ({
        name: r.metadata?.skill_name || r.key,
        description: r.metadata?.description || '',
        location: r.metadata?.location || '',
        score: 1 - (r.distance / 2), // cosine distance [0,2] -> similarity [1,0]
        metadata: r.metadata || {}
      }));
    } else {
      // 3. 向量搜索（客户端实现）
      skills = await this.searchVectorsClientSide(queryVector, this.config.topK);
    }
    
    // 4. 过滤低相似度结果
    const filtered = results.filter(r => r.score >= this.config.threshold);
    
    // 5. 缓存结果
    if (this.config.cacheEnabled && filtered.length > 0) {
      this.setCached(userQuery, filtered);
    }
    
    return filtered;
  }
  
  /**
   * S3 Vectors 原生查询
   */
  async queryS3Vectors(queryVector) {
    const command = new QueryVectorsCommand({
      vectorBucketName: this.config.vectorBucketName,
      indexName: this.config.vectorIndexName,
      topK: this.config.topK,
      queryVector: { float32: queryVector },
      returnDistance: true,
      returnMetadata: true
    });

    const response = await this.s3VectorsClient.send(command);

    if (!response.vectors || response.vectors.length === 0) {
      return [];
    }

    return response.vectors;
  }

  /**
   * 客户端向量搜索（回退方案）
   */
  async searchVectorsClientSide(queryVector, maxResults) {
    // 加载所有 skills
    const skills = await this.loadSkillsList();
    
    if (!skills || skills.length === 0) {
      console.warn('⚠️  ISS: No skills found in S3');
      return [];
    }
    
    // 计算每个 skill 的余弦相似度
    const similarities = skills.map(skill => {
      const similarity = this.cosineSimilarity(queryVector, skill.vector);
      return {
        name: skill.skill_name,
        description: skill.description,
        location: skill.location,
        score: similarity,
        metadata: skill.metadata
      };
    });
    
    // 按相似度排序，返回 top K
    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
  
  /**
   * 计算余弦相似度
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  /**
   * 生成向量嵌入
   */
  async getEmbedding(text) {
    const command = new InvokeModelCommand({
      modelId: this.config.embeddingModel,
      body: JSON.stringify({
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
      })
    });
    
    const response = await this.bedrockClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    
    if (!result.embeddings || !Array.isArray(result.embeddings) || !result.embeddings[0]?.embedding) {
      throw new Error('Invalid embedding response from Nova MME');
    }
    
    return result.embeddings[0].embedding;
  }
  
  /**
   * 获取缓存
   */
  getCached(query) {
    const entry = this.cache.get(query);
    
    if (!entry) {
      return null;
    }
    
    const now = Date.now();
    if (now - entry.timestamp > this.config.cacheTTL * 1000) {
      // 缓存过期
      this.cache.delete(query);
      return null;
    }
    
    return entry.skills;
  }
  
  /**
   * 设置缓存
   */
  setCached(query, skills) {
    this.cache.set(query, {
      skills,
      timestamp: Date.now()
    });
    
    // 简单的缓存清理：如果缓存超过 100 条，删除最旧的
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
    this.skillsCache = null;
    this.skillsCacheTime = null;
  }
}

module.exports = { SkillRetriever };

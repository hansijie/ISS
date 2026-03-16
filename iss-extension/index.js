/**
 * OpenClaw ISS Extension v2.1
 * 
 * 使用 before_prompt_build hook 拦截 prompt 构建，替换默认的 skills 注入
 * 版本：2.1.0（真正的无侵入式）
 */

const { SkillRetriever } = require('./skill-retriever');
const fs = require('fs');
const path = require('path');

// 全局配置
let config;
let retriever;
let isInitialized = false;

/**
 * 加载配置
 */
function loadConfig(pluginConfig = {}) {
  const configPath = path.join(__dirname, 'config.json');
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(configContent);
    Object.assign(config, pluginConfig);
    
    // 环境变量覆盖
    if (process.env.OPENCLAW_SKILLS_GP_BUCKET) {
      config.s3Bucket = process.env.OPENCLAW_SKILLS_GP_BUCKET;
    }
    if (process.env.OPENCLAW_SKILLS_VECTOR_BUCKET) {
      config.vectorBucketName = process.env.OPENCLAW_SKILLS_VECTOR_BUCKET;
    }
    if (process.env.OPENCLAW_SKILLS_VECTOR_INDEX) {
      config.vectorIndexName = process.env.OPENCLAW_SKILLS_VECTOR_INDEX;
    }
    if (process.env.OPENCLAW_SKILLS_USE_S3_VECTORS_BUCKET) {
      config.use_s3v = process.env.OPENCLAW_SKILLS_USE_S3_VECTORS_BUCKET;
    }
    if (process.env.AWS_REGION) {
      config.awsRegion = process.env.AWS_REGION;
    }
    if (process.env.ISS_ENABLED !== undefined) {
      config.enabled = process.env.ISS_ENABLED === 'true';
    }
    
    return config;
  } catch (error) {
    console.warn(`⚠️  ISS: Failed to load config.json, using defaults: ${error.message}`);
    return {
      enabled: true,
      s3Bucket: process.env.OPENCLAW_SKILLS_GP_BUCKET || 'openclaw-skills-vectors',
      vectorBucketName: process.env.OPENCLAW_SKILLS_VECTOR_BUCKET || 'openclaw-skills-vectors',
      vectorIndexName: process.env.OPENCLAW_SKILLS_VECTOR_INDEX || 'skills',
      use_s3v: process.env.OPENCLAW_SKILLS_USE_S3_VECTORS_BUCKET === 'true',
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      topK: 3,
      threshold: 0.2,
      cacheEnabled: true,
      cacheTTL: 3600,
      ...pluginConfig
    };
  }
}

/**
 * 异步初始化
 */
async function initAsync() {
  console.log('🚀 ISS v2.1: Initializing...');
  console.log(`   Mode: before_prompt_build hook`);
  if (config.use_s3v) {
    console.log(`   S3 Vectors Bucket: ${config.vectorBucketName}, Index: ${config.vectorIndexName}`);
  } else {
    console.log(`   S3 GP Bucket: ${config.s3Bucket}`);
  }
  console.log(`   AWS Region: ${config.awsRegion}`);
  console.log(`   Top K: ${config.topK}`);
  console.log(`   Threshold: ${config.threshold}`);
  
  try {
    retriever = new SkillRetriever(config);
    await retriever.init();
    
    isInitialized = true;
    console.log('✅ ISS v2.1: Ready');
  } catch (error) {
    console.error(`❌ ISS v2.1: Initialization failed: ${error.message}`);
    console.error('   ISS will be disabled for this session');
    config.enabled = false;
    isInitialized = true;
    throw error;
  }
}

/**
 * before_prompt_build hook
 * 
 * 在 OpenClaw 构建 prompt 之前拦截：
 * 1. 提取用户最后一条消息
 * 2. 检索相关 skills
 * 3. 替换默认的 skills 列表（通过 context.skills）
 */
async function beforePromptBuild(hookContext) {
  try {
    // 检查是否已初始化和启用
    if (!isInitialized || !config || !config.enabled || !retriever) {
      return;
    }

    // 提取用户最后一条消息
    const messages = hookContext.messages || [];
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find(m => m.role === 'user');
    
    if (!lastUserMessage || !lastUserMessage.content) {
      return;
    }

    let userQuery = '';
    if (typeof lastUserMessage.content === 'string') {
      userQuery = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      // 多模态消息，提取 text 部分
      const textPart = lastUserMessage.content.find(p => p.type === 'text');
      if (textPart && textPart.text) {
        userQuery = textPart.text;
      }
    }

    if (!userQuery || userQuery.trim().length === 0) {
      return;
    }

    // 截断显示
    const displayQuery = userQuery.length > 80 
      ? userQuery.substring(0, 80) + '...' 
      : userQuery;
    
    console.log(`\n🔍 ISS v2.1: Retrieving skills for: "${displayQuery}"`);
    
    const startTime = Date.now();
    
    // 检索相关 skills
    const relevantSkills = await retriever.retrieveRelevantSkills(userQuery);
    
    const retrievalTime = Date.now() - startTime;
    
    if (relevantSkills.length === 0) {
      console.log(`   ⚠️  No relevant skills found (threshold: ${config.threshold})`);
      console.log(`   ⏱️  Retrieval time: ${retrievalTime}ms`);
      console.log(`   ✅ No skills will be injected (empty result)\n`);
      
      // 返回空结果（不注入 skills）
      return {};
    }
    
    // 输出匹配的 skills
    console.log(`   ✅ Found ${relevantSkills.length} relevant skill(s):`);
    relevantSkills.forEach((s, i) => {
      console.log(`      ${i + 1}. ${s.name} (score: ${s.score.toFixed(3)})`);
    });
    console.log(`   ⏱️  Retrieval time: ${retrievalTime}ms`);
    
    // 通过 prependSystemContext 注入 skills 块
    // 这样会在 system prompt 开头添加 skills，OpenClaw 的默认 skills 注入会被覆盖
    const skillsBlock = buildSkillsBlock(relevantSkills);
    
    console.log(`   ✅ Injected ${relevantSkills.length} skills via prependSystemContext\n`);
    
    // 返回 hook 结果
    return {
      prependSystemContext: skillsBlock
    };
    
  } catch (error) {
    console.error(`❌ ISS v2.1 Error in before_prompt_build: ${error.message}`);
    console.error(error.stack);
    // 出错时不阻塞 OpenClaw，返回空对象
    return {};
  }
}

/**
 * 构建 skills 描述块（备用方案）
 */
function buildSkillsBlock(skills) {
  let block = '<available_skills>\n';
  block += '  <!-- ISS: Relevant skills only -->\n';
  
  for (const skill of skills) {
    block += '  <skill>\n';
    block += `    <name>${skill.name}</name>\n`;
    block += `    <description>${skill.description}</description>\n`;
    block += `    <location>${skill.location}</location>\n`;
    block += '  </skill>\n';
  }
  
  block += '</available_skills>';
  
  return block;
}

/**
 * OpenClaw 插件导出
 */
const plugin = {
  id: 'openclaw-iss',
  name: 'OpenClaw ISS v2.1',
  description: 'Intelligent Skills System - replaces default skills with vector-searched relevant skills',
  version: '2.1.0',
  
  register(api) {
    try {
      console.log('[ISS v2.1] Registering plugin...');
      
      // 加载配置
      const pluginConfig = api.config || {};
      config = loadConfig(pluginConfig);
      
      // 注册 before_prompt_build hook
      if (api.registerHook) {
        api.registerHook('before_prompt_build', beforePromptBuild);
        console.log('[ISS v2.1] before_prompt_build hook registered');
      } else {
        console.warn('[ISS v2.1] Warning: api.registerHook not available');
      }
      
      // 异步初始化检索器
      if (config.enabled) {
        console.log('🚀 ISS v2.1: Starting async initialization...');
        initAsync().catch(error => {
          console.error('[ISS v2.1] Failed to initialize:', error.message);
          config.enabled = false;
        });
      } else {
        console.log('⚠️  ISS v2.1: Disabled in config');
        isInitialized = true;
      }
    } catch (error) {
      console.error('[ISS v2.1] Registration error:', error.message);
      console.error('[ISS v2.1] Stack:', error.stack);
      throw error;
    }
  }
};

module.exports = plugin;
module.exports.default = plugin;

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
    if (process.env.OPENCLAW_SKILLS_VECTOR_BUCKET) {
      config.s3Bucket = process.env.OPENCLAW_SKILLS_VECTOR_BUCKET;
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
      s3Bucket: process.env.OPENCLAW_SKILLS_VECTOR_BUCKET || 'openclaw-skills-vectors',
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
  console.log(`   S3 Bucket: ${config.s3Bucket}`);
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
      console.log(`   ✅ Will use empty skills list (suppress default)\n`);
      
      // 设置空的 skills 列表（抑制默认注入）
      if (hookContext.skills !== undefined) {
        hookContext.skills = [];
      }
      return;
    }
    
    // 输出匹配的 skills
    console.log(`   ✅ Found ${relevantSkills.length} relevant skill(s):`);
    relevantSkills.forEach((s, i) => {
      console.log(`      ${i + 1}. ${s.name} (score: ${s.score.toFixed(3)})`);
    });
    console.log(`   ⏱️  Retrieval time: ${retrievalTime}ms`);
    
    // 替换 OpenClaw 默认的 skills 列表
    // hookContext.skills 应该是 OpenClaw 准备注入的 skills 数组
    if (hookContext.skills !== undefined) {
      // 转换为 OpenClaw skills 格式
      hookContext.skills = relevantSkills.map(s => ({
        name: s.name,
        description: s.description,
        location: s.location,
        // 可能还需要其他字段，取决于 OpenClaw 的 skills 格式
      }));
      
      console.log(`   ✅ Replaced default skills with ISS results\n`);
    } else {
      // 如果 hookContext 不支持直接修改 skills，尝试通过 prependSystemContext 注入
      const skillsBlock = buildSkillsBlock(relevantSkills);
      
      if (!hookContext.prependSystemContext) {
        hookContext.prependSystemContext = '';
      }
      hookContext.prependSystemContext = skillsBlock + '\n\n' + hookContext.prependSystemContext;
      
      console.log(`   ✅ Injected skills via prependSystemContext\n`);
    }
    
  } catch (error) {
    console.error(`❌ ISS v2.1 Error in before_prompt_build: ${error.message}`);
    console.error(error.stack);
    // 出错时不阻塞 OpenClaw
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

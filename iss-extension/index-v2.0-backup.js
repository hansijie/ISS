/**
 * OpenClaw ISS Extension
 * 
 * 功能：通过 message hooks 实现智能 skill 检索
 * 版本：2.0.0（无侵入式）
 */

const { SkillRetriever } = require('./skill-retriever');
const fs = require('fs');
const path = require('path');

// 全局配置
let config;
let retriever;
let isInitialized = false;
let runtime; // OpenClaw runtime

/**
 * 加载配置
 */
function loadConfig(pluginConfig = {}) {
  const configPath = path.join(__dirname, 'config.json');
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(configContent);
    
    // 插件配置覆盖
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
 * OpenClaw 插件异步初始化
 */
async function initPluginAsync() {
  console.log('🚀 ISS Extension: Initializing...');
  console.log(`   Version: 2.0.0`);
  console.log(`   S3 Bucket: ${config.s3Bucket}`);
  console.log(`   AWS Region: ${config.awsRegion}`);
  console.log(`   Top K: ${config.topK}`);
  console.log(`   Threshold: ${config.threshold}`);
  console.log(`   Cache: ${config.cacheEnabled ? 'Enabled' : 'Disabled'}`);
  
  // 初始化检索器
  try {
    retriever = new SkillRetriever(config);
    await retriever.init();
    
    isInitialized = true;
    console.log('✅ ISS Extension: Ready');
  } catch (error) {
    console.error(`❌ ISS Extension: Initialization failed: ${error.message}`);
    console.error('   ISS will be disabled for this session');
    config.enabled = false;
    isInitialized = true;
    throw error;
  }
}

/**
 * OpenClaw 插件初始化（兼容旧代码）
 */
async function initPlugin(api) {
  runtime = api.runtime;
  
  // 加载配置
  const pluginConfig = api.config || {};
  config = loadConfig(pluginConfig);
  
  if (!config.enabled) {
    console.log('⚠️  ISS Extension: Disabled in config');
    isInitialized = true;
    return;
  }
  
  await initPluginAsync();
}

/**
 * OpenClaw message receive hook
 * 
 * 在用户消息到达 OpenClaw 之前拦截，注入相关 skills
 */
async function onMessageReceived(message, context) {
  try {
    // 检查 message 对象是否有效
    if (!message || typeof message !== 'object') {
      return message;
    }
    
    // 检查是否已初始化
    if (!isInitialized) {
      return message;
    }
    
    // 检查是否启用
    if (!config || !config.enabled) {
      return message;
    }
    
    // 提取用户问题，确保是字符串
    let userQuery = message.content || message.text || '';
    if (typeof userQuery !== 'string') {
      userQuery = String(userQuery || '');
    }
    
    if (!userQuery || userQuery.trim().length === 0) {
      return message;
    }
    
    // 截断显示的问题文本
    const displayQuery = userQuery.length > 80 
      ? userQuery.substring(0, 80) + '...' 
      : userQuery;
    
    console.log(`\n🔍 ISS: Retrieving skills for: "${displayQuery}"`);
    
    const startTime = Date.now();
    
    // 检索相关 skills
    const relevantSkills = await retriever.retrieveRelevantSkills(userQuery);
    
    const retrievalTime = Date.now() - startTime;
    
    if (relevantSkills.length === 0) {
      console.log(`   ⚠️  No relevant skills found (threshold: ${config.threshold})`);
      console.log(`   ⏱️  Retrieval time: ${retrievalTime}ms\n`);
      return message;
    }
    
    // 输出匹配的 skills
    console.log(`   ✅ Found ${relevantSkills.length} relevant skill(s):`);
    relevantSkills.forEach((s, i) => {
      console.log(`      ${i + 1}. ${s.name} (score: ${s.score.toFixed(3)})`);
    });
    console.log(`   ⏱️  Retrieval time: ${retrievalTime}ms`);
    
    // 构建 skills 描述块
    const skillsBlock = buildSkillsBlock(relevantSkills);
    
    // 注入到 system prompt 或消息中
    const injected = injectSkills(message, context, skillsBlock);
    
    if (injected) {
      console.log(`   ✅ Skills injected successfully\n`);
    } else {
      console.log(`   ⚠️  Could not inject skills (unsupported context)\n`);
    }
    
    return message;
    
  } catch (error) {
    console.error(`❌ ISS Error in message hook: ${error.message}`);
    console.error(error.stack);
    // 出错时回退，不阻塞 OpenClaw
    return message;
  }
}

/**
 * 构建 skills 描述块
 */
function buildSkillsBlock(skills) {
  let block = '\n<available_skills>\n';
  block += '  <!-- Relevant skills retrieved by ISS -->\n';
  
  for (const skill of skills) {
    block += '  <skill>\n';
    block += `    <name>${skill.name}</name>\n`;
    block += `    <description>${skill.description}</description>\n`;
    block += `    <location>${skill.location}</location>\n`;
    block += '  </skill>\n';
  }
  
  block += '</available_skills>\n';
  
  return block;
}

/**
 * 注入 skills 到 system prompt 或消息中
 */
function injectSkills(message, context, skillsBlock) {
  // 方式 1：通过 context.systemPromptOverride 注入
  if (context && typeof context.systemPromptOverride === 'string') {
    if (context.systemPromptOverride.includes('<!-- SKILLS_PLACEHOLDER -->')) {
      context.systemPromptOverride = context.systemPromptOverride.replace(
        '<!-- SKILLS_PLACEHOLDER -->',
        skillsBlock
      );
      return true;
    } else {
      // 附加到末尾
      context.systemPromptOverride += '\n' + skillsBlock;
      return true;
    }
  }
  
  // 方式 2：通过 context.systemPrompt 注入
  if (context && typeof context.systemPrompt === 'string') {
    if (context.systemPrompt.includes('<!-- SKILLS_PLACEHOLDER -->')) {
      context.systemPrompt = context.systemPrompt.replace(
        '<!-- SKILLS_PLACEHOLDER -->',
        skillsBlock
      );
      return true;
    } else {
      context.systemPrompt += '\n' + skillsBlock;
      return true;
    }
  }
  
  // 方式 3：附加到用户消息前面（最后的回退）
  if (message.content) {
    message.content = skillsBlock + '\n\n' + message.content;
    return true;
  }
  
  if (message.text) {
    message.text = skillsBlock + '\n\n' + message.text;
    return true;
  }
  
  return false;
}

/**
 * 清理缓存（命令）
 */
async function clearCache() {
  if (retriever) {
    retriever.clearCache();
    console.log('✅ ISS: Cache cleared');
  }
}

/**
 * 重新加载 skills（命令）
 */
async function reloadSkills() {
  if (retriever) {
    await retriever.loadSkillsList();
    console.log('✅ ISS: Skills reloaded');
  }
}

/**
 * OpenClaw 插件导出
 */
const plugin = {
  id: 'openclaw-iss',
  name: 'OpenClaw ISS',
  description: 'Intelligent Skills System - Smart skill retrieval using S3 Vectors and Nova MME',
  version: '2.0.0',
  
  // OpenClaw 插件注册
  register(api) {
    try {
      console.log('[ISS] Registering plugin...');
      
      // 同步初始化（异步操作延后）
      runtime = api.runtime;
      const pluginConfig = api.config || {};
      config = loadConfig(pluginConfig);
      
      // 注册 message hook（如果 API 支持）
      if (api.registerHook) {
        api.registerHook('messageReceived', onMessageReceived);
        console.log('[ISS] Message hook registered');
      } else {
        console.warn('[ISS] Warning: api.registerHook not available');
      }
      
      // 注册命令（暂时禁用，避免格式问题）
      // if (api.registerCommand) {
      //   api.registerCommand('iss:clear-cache', clearCache);
      //   api.registerCommand('iss:reload-skills', reloadSkills);
      //   console.log('[ISS] Commands registered');
      // }
      
      // 异步初始化检索器（不阻塞注册）
      if (config.enabled) {
        console.log('🚀 ISS: Starting async initialization...');
        initPluginAsync().catch(error => {
          console.error('[ISS] Failed to initialize:', error.message);
          config.enabled = false;
        });
      } else {
        console.log('⚠️  ISS: Disabled in config');
        isInitialized = true;
      }
    } catch (error) {
      console.error('[ISS] Registration error:', error.message);
      console.error('[ISS] Stack:', error.stack);
      throw error;
    }
  }
};

// 默认导出（OpenClaw 插件格式）
module.exports = plugin;

// 兼容旧格式
module.exports.default = plugin;

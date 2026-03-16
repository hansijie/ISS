/**
 * ISS Hook Handler - Intelligent Skill Selection
 * 
 * 在 message:preprocessed 阶段拦截消息，召回相关 skills 并注入
 */

const path = require('path');
const fs = require('fs');

// 延迟加载
let SkillRetriever;
let retriever;
let config;
let isInitialized = false;

/**
 * 初始化 ISS
 */
async function initializeISS() {
  if (isInitialized) {
    return;
  }

  try {
    // ISS 扩展路径
    const issPath = path.join(process.env.HOME || '', '.openclaw', 'extensions', 'openclaw-iss');
    
    // 检查 ISS 是否已安装
    if (!fs.existsSync(issPath)) {
      console.warn('[ISS Hook] openclaw-iss extension not found, hook disabled');
      isInitialized = true;
      return;
    }

    // 加载配置
    const configPath = path.join(issPath, 'config.json');
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(configContent);
    } else {
      config = {
        enabled: true,
        s3Bucket: process.env.OPENCLAW_SKILLS_GP_BUCKET || 'openclaw-skills-vectors',
	vectorBucketName: process.env.OPENCLAW_SKILLS_VECTOR_BUCKET || 'openclaw-skills-vectors',
	vectorIndexName: process.env.OPENCLAW_SKILLS_VECTOR_INDEX || 'skills',
	use_s3v: process.env.OPENCLAW_SKILLS_USE_S3_VECTORS_BUCKET || false,
        awsRegion: process.env.AWS_REGION || 'us-east-1',
        topK: parseInt(process.env.ISS_TOP_K || '3'),
        threshold: parseFloat(process.env.ISS_THRESHOLD || '0.2'),
        cacheEnabled: true,
        cacheTTL: 3600
      };
    }

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
    if (process.env.ISS_TOP_K) {
      config.topK = parseInt(process.env.ISS_TOP_K);
    }
    if (process.env.ISS_THRESHOLD) {
      config.threshold = parseFloat(process.env.ISS_THRESHOLD);
    }

    // 检查是否启用
    if (!config.enabled) {
      console.log('[ISS Hook] Disabled in config');
      isInitialized = true;
      return;
    }

    // 加载 SkillRetriever
    const retrieverPath = path.join(issPath, 'skill-retriever.js');
    const { SkillRetriever: Retriever } = require(retrieverPath);
    SkillRetriever = Retriever;

    // 初始化检索器
    retriever = new SkillRetriever(config);
    await retriever.init();

    console.log('✅ ISS Hook: Initialized');
    if (config.use_s3v) {
      console.log(`   S3 Vectors Bucket: ${config.vectorBucketName}, Index: ${config.vectorIndexName}`);
    } else {
      console.log(`   S3 Bucket: ${config.s3Bucket}`);
    }
    console.log(`   Top K: ${config.topK}, Threshold: ${config.threshold}`);

    isInitialized = true;
  } catch (error) {
    console.error(`❌ ISS Hook: Initialization failed: ${error.message}`);
    console.error('[ISS Hook] Hook will be disabled for this session');
    isInitialized = true;
    config = { enabled: false };
  }
}

/**
 * 构建 skills 描述块
 */
function buildSkillsBlock(skills) {
  let block = '\n<available_skills>\n';
  block += '  <!-- ISS: Dynamically retrieved relevant skills -->\n';
  
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
 * Hook Handler
 */
const handler = async (event) => {
  // 调试：输出所有事件
  console.log(`[ISS Hook DEBUG] Received event: type=${event.type}, action=${event.action}`);
  
  // 只处理 message:preprocessed 事件
  if (event.type !== 'message' || event.action !== 'preprocessed') {
    console.log(`[ISS Hook DEBUG] Skipping event (not message:preprocessed)`);
    return;
  }
  
  console.log(`[ISS Hook DEBUG] Handling message:preprocessed event`);

  try {
    // 延迟初始化
    await initializeISS();

    // 检查是否已启用
    if (!config || !config.enabled || !retriever) {
      return;
    }

    // 提取用户消息
    let userQuery = event.context?.bodyForAgent || event.context?.body || '';
    
    console.log(`[ISS Hook DEBUG] Original userQuery = "${userQuery.substring(0, 100)}..."`);
    
    // 解析 OpenClaw 的消息格式：[message_id: xxx]\nou_xxx: 实际内容
    // 提取最后一行的实际消息内容
    if (userQuery.includes('\n')) {
      const lines = userQuery.split('\n');
      // 找到包含 "ou_xxx:" 的行
      const senderLine = lines.find(line => line.match(/^ou_[a-f0-9]+:/));
      if (senderLine) {
        // 提取 ":" 后面的内容
        userQuery = senderLine.split(':', 2)[1]?.trim() || userQuery;
        console.log(`[ISS Hook DEBUG] Extracted userQuery = "${userQuery}"`);
      }
    }
    
    console.log(`[ISS Hook DEBUG] userQuery type = ${typeof userQuery}`);
    console.log(`[ISS Hook DEBUG] userQuery length = ${userQuery.length}`);
    
    if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length === 0) {
      console.log(`[ISS Hook DEBUG] Skipping: empty or invalid userQuery`);
      return;
    }

    // 截断显示的问题文本
    const displayQuery = userQuery.length > 80 
      ? userQuery.substring(0, 80) + '...' 
      : userQuery;
    
    console.log(`\n🎯 ISS: Retrieving skills for: "${displayQuery}"`);
    
    const startTime = Date.now();
    
    // 检索相关 skills
    const relevantSkills = await retriever.retrieveRelevantSkills(userQuery);
    
    const retrievalTime = Date.now() - startTime;
    
    if (relevantSkills.length === 0) {
      console.log(`   ⚠️  No relevant skills found (threshold: ${config.threshold})`);
      console.log(`   ⏱️  Retrieval time: ${retrievalTime}ms\n`);
      return;
    }
    
    // 输出匹配的 skills
    console.log(`   ✅ Found ${relevantSkills.length} relevant skill(s):`);
    relevantSkills.forEach((s, i) => {
      console.log(`      ${i + 1}. ${s.name} (score: ${s.score.toFixed(3)})`);
    });
    console.log(`   ⏱️  Retrieval time: ${retrievalTime}ms`);
    
    // 构建 skills 描述块
    const skillsBlock = buildSkillsBlock(relevantSkills);
    
    // 注入到消息前面
    if (event.context && event.context.bodyForAgent) {
      event.context.bodyForAgent = skillsBlock + '\n\n' + event.context.bodyForAgent;
      console.log(`   ✅ Skills injected\n`);
    } else if (event.context && event.context.body) {
      event.context.body = skillsBlock + '\n\n' + event.context.body;
      console.log(`   ✅ Skills injected\n`);
    } else {
      console.log(`   ⚠️  Could not inject skills (context not writable)\n`);
    }
    
  } catch (error) {
    console.error(`❌ ISS Hook Error: ${error.message}`);
    console.error(error.stack);
    // 出错时静默失败，不阻塞消息处理
  }
};

module.exports = handler;

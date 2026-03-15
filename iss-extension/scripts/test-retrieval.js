#!/usr/bin/env node
/**
 * ISS 检索功能测试脚本
 * 
 * 使用方式：node scripts/test-retrieval.js "查询文本"
 * 
 * 功能：
 * - 测试向量化
 * - 测试 S3 Vectors 搜索
 * - 显示检索结果和评分
 */

const { SkillRetriever } = require('../skill-retriever');

// 测试查询列表
const TEST_QUERIES = [
  '帮我查飞书文档',
  'Check weather forecast',
  '扫描代码安全漏洞',
  'Create a GitHub issue',
  '上传文件到飞书',
  'Help me be more proactive'
];

/**
 * 主函数
 */
async function main() {
  const queryArg = process.argv[2];
  
  console.log('🧪 ISS Retrieval Test\n');
  console.log('='.repeat(60));
  
  // 初始化检索器
  console.log('🔧 Initializing SkillRetriever...');
  const retriever = new SkillRetriever({
    s3Bucket: process.env.OPENCLAW_SKILLS_VECTOR_BUCKET || 'openclaw-skills-vectors',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    topK: 3,
    threshold: 0.2,  // 降低阈值
    cacheEnabled: false  // 测试时禁用缓存
  });
  
  await retriever.init();
  console.log('✅ Retriever initialized\n');
  console.log('='.repeat(60));
  
  // 确定测试查询
  const queries = queryArg ? [queryArg] : TEST_QUERIES;
  
  // 逐个测试
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    
    console.log(`\n\n📝 Query ${i + 1}/${queries.length}: "${query}"`);
    console.log('-'.repeat(60));
    
    try {
      const startTime = Date.now();
      
      // 检索相关 skills
      const results = await retriever.retrieveRelevantSkills(query);
      
      const elapsedTime = Date.now() - startTime;
      
      if (results.length === 0) {
        console.log('⚠️  No skills found (all below threshold)');
      } else {
        console.log(`✅ Found ${results.length} relevant skill(s):\n`);
        
        results.forEach((skill, idx) => {
          console.log(`   ${idx + 1}. ${skill.name}`);
          console.log(`      Score: ${skill.score.toFixed(3)}`);
          console.log(`      Description: ${skill.description.substring(0, 100)}...`);
          console.log();
        });
      }
      
      console.log(`⏱️  Retrieval time: ${elapsedTime}ms`);
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      console.error(error.stack);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete!\n');
}

// 运行测试
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { main };

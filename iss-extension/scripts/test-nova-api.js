const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

async function testNovaMMECorrect() {
  const client = new BedrockRuntimeClient({ region: 'us-east-1' });
  
  console.log('🧪 Testing Amazon Nova 2 Multimodal Embeddings (multimodal format)\n');
  console.log('='.repeat(70));
  
  // 多模态格式：content 是数组
  const formats = [
    {
      name: 'Format 1: text in content array',
      body: {
        messages: [
          {
            role: 'user',
            content: [
              { text: 'test embedding' }
            ]
          }
        ]
      }
    },
    {
      name: 'Format 2: with embeddingConfig',
      body: {
        messages: [
          {
            role: 'user',
            content: [
              { text: 'test embedding' }
            ]
          }
        ],
        embeddingConfig: {
          outputEmbeddingLength: 1024
        }
      }
    },
    {
      name: 'Format 3: with dimensions',
      body: {
        messages: [
          {
            role: 'user',
            content: [
              { text: 'test embedding' }
            ]
          }
        ],
        dimensions: 1024
      }
    }
  ];
  
  for (const format of formats) {
    console.log(`\n🧪 Testing ${format.name}`);
    console.log(`   Body: ${JSON.stringify(format.body, null, 2)}`);
    
    try {
      const command = new InvokeModelCommand({
        modelId: 'amazon.nova-2-multimodal-embeddings-v1:0',
        body: JSON.stringify(format.body)
      });
      
      const response = await client.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));
      
      console.log(`   ✅ Success!`);
      console.log(`   Response keys: ${Object.keys(result).join(', ')}`);
      
      if (result.embedding) {
        console.log(`   Embedding length: ${result.embedding.length}`);
        console.log(`   First 3 values: ${result.embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}`);
      } else if (result.embeddings) {
        console.log(`   Embeddings: ${result.embeddings.length} vectors`);
        if (result.embeddings[0]) {
          console.log(`   First embedding length: ${result.embeddings[0].length}`);
        }
      }
      
      console.log(`\n   ✅✅✅ THIS IS THE CORRECT FORMAT! ✅✅✅`);
      return format;
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('❌ None of the formats worked!');
}

testNovaMMECorrect()
  .then(correctFormat => {
    if (correctFormat) {
      console.log('\n' + '='.repeat(70));
      console.log('✅ Correct API format found!');
      console.log('='.repeat(70));
      console.log(JSON.stringify(correctFormat.body, null, 2));
    }
  })
  .catch(console.error);

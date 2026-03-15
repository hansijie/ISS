const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

async function testNovaMMME() {
  const client = new BedrockRuntimeClient({ region: 'us-east-1' });
  
  console.log('🧪 Testing Nova MME with correct format\n');
  console.log('='.repeat(70));
  
  const requestBody = {
    schemaVersion: 'nova-multimodal-embed-v1',
    taskType: 'SINGLE_EMBEDDING',
    singleEmbeddingParams: {
      embeddingPurpose: 'GENERIC_RETRIEVAL',
      embeddingDimension: 1024,
      text: {
        truncationMode: 'NONE',
        value: 'test embedding'
      }
    }
  };
  
  console.log('Request body:');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log();
  
  try {
    const command = new InvokeModelCommand({
      modelId: 'amazon.nova-2-multimodal-embeddings-v1:0',
      body: JSON.stringify(requestBody)
    });
    
    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    
    console.log('✅ Success!');
    console.log(`Response keys: ${Object.keys(result).join(', ')}`);
    console.log(`Embeddings count: ${result.embeddings.length}`);
    console.log(`Embedding length: ${result.embeddings[0].embedding.length}`);
    console.log(`First 3 values: ${result.embeddings[0].embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}`);
    console.log();
    console.log('✅✅✅ Nova MME is working! ✅✅✅');
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
  }
}

testNovaMMME().catch(console.error);

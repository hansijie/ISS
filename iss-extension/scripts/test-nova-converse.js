const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');

async function testNovaMMEConverse() {
  const client = new BedrockRuntimeClient({ region: 'us-east-1' });
  
  console.log('🧪 Testing Nova MME with Converse API\n');
  console.log('='.repeat(70));
  
  try {
    const command = new ConverseCommand({
      modelId: 'amazon.nova-2-multimodal-embeddings-v1:0',
      messages: [
        {
          role: 'user',
          content: [
            { text: 'test embedding' }
          ]
        }
      ]
    });
    
    const response = await client.send(command);
    console.log('✅ Converse API response:');
    console.log(JSON.stringify(response, null, 2));
    
  } catch (error) {
    console.log(`❌ Converse API error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Testing with inputImage format (multimodal embeddings)\n');
  
  try {
    const command = new InvokeModelCommand({
      modelId: 'amazon.nova-2-multimodal-embeddings-v1:0',
      body: JSON.stringify({
        inputText: "test embedding"
      })
    });
    
    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    console.log('✅ InputText format response:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

testNovaMMEConverse().catch(console.error);

import { RealtimeVision } from '@overshoot/sdk';

async function startVision() {
  const vision = new RealtimeVision({
    apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
    apiKey: 'REPLACE_WITH_YOUR_API_KEY',
    prompt: 'Read any visible text',
    onResult: (result) => {
      console.log(result.result);
    }
  });

  await vision.start();
}

startVision();
import { createRealtimeVision } from './agent';

export async function runConnectivityTest() {
  console.clear();
  console.log("%c[Overshoot Debug] Starting Diagnostic Test...", "color: cyan; font-weight: bold; font-size: 14px");

  // 1. Check API Key
  const key = localStorage.getItem('OVS_API_KEY');
  if (!key) {
    console.error("%c[Overshoot Debug] ❌ No API Key found.", "color: red");
    alert("Missing API Key. Please reload and enter it when prompted.");
    return;
  }
  console.log("[Overshoot Debug] ✅ API Key found.");

  // 2. Create a Mock Video Stream (Canvas)
  // We do this to ensure a perfect 30FPS stream is available immediately, bypassing permission prompts.
  const canvas = document.createElement('canvas');
  canvas.width = 640; 
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  
  // Draw a clock so the model has something to read
  const drawInterval = setInterval(() => {
    ctx.fillStyle = '#00aa00'; // Green background
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = 'white';
    ctx.font = '40px monospace';
    ctx.fillText("OVERSHOOT TEST", 50, 200);
    ctx.fillText(new Date().toISOString().split('T')[1], 50, 260);
  }, 33); // ~30fps

  const mockStream = canvas.captureStream(30);
  console.log("[Overshoot Debug] ✅ Mock 'Green Screen' Stream created.");

  // 3. Monkey-Patch getUserMedia
  // We force the SDK to use our mock stream instead of asking for a camera
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    console.log("[Overshoot Debug] 🛠️ SDK requested camera access. Intercepting and serving Mock Stream.");
    return mockStream;
  };

  // 4. Initialize and Start SDK
  try {
    console.log("[Overshoot Debug] 🚀 Initializing RealtimeVision...");
    
    const vision = createRealtimeVision({
      prompt: "Read the text and the timestamp on the screen.",
      onResult: (res) => {
        // Log RAW output
        console.log("%c[Overshoot Debug] 📡 Data Received:", "color: lime", res);
        
        if (res && res.result && res.result.result) {
            console.log(`%c[Overshoot Debug] 🗣️ Model says: "${res.result.result}"`, "color: yellow; font-weight: bold");
        }
      }
    });

    await vision.start();
    console.log("%c[Overshoot Debug] ✅ SDK Connection Open. Watch this console for logs...", "color: cyan");

    // 5. Cleanup after 20 seconds
    setTimeout(async () => {
      console.log("[Overshoot Debug] 🛑 Stopping Test...");
      await vision.stop();
      clearInterval(drawInterval);
      navigator.mediaDevices.getUserMedia = originalGetUserMedia; // Restore original function
      console.log("[Overshoot Debug] Test Complete.");
    }, 20000);

  } catch (e) {
    console.error("%c[Overshoot Debug] 💥 FATAL ERROR:", "color: red; font-weight: bold", e);
    navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    clearInterval(drawInterval);
  }
}
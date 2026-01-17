import { useEffect, useRef, useState } from 'react';
import './App.css';
import { createRealtimeVision } from './agent.js';

function stringify(x) {
  try {
    return typeof x === 'string' ? x : JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

export default function App() {
  const videoRef = useRef(null);
  const previewStreamRef = useRef(null);
  const visionRef = useRef(null);

  const [status, setStatus] = useState('Ready');
  const [latestText, setLatestText] = useState('');
  const [logs, setLogs] = useState('');

  function addLog(...args) {
    const line = args.map(stringify).join(' ');
    setLogs((prev) => (prev ? `${prev}\n${line}` : line));
    // keep console too
    console.log(...args);
  }

  async function ensurePreviewStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'Camera API not available. Open this in a browser on http://localhost (not Node).'
      );
    }
    if (previewStreamRef.current) return previewStreamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    previewStreamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    return stream;
  }

  async function start() {
    try {
      setStatus('Requesting camera permission…');
      await ensurePreviewStream();

      setStatus('Starting RealtimeVision…');
      addLog('Starting RealtimeVision…');

      const vision = createRealtimeVision({
        prompt: 'Read any visible text',
        onResult: (result) => {
          // Log full payload so you can see the structure
          addLog('onResult:', result);
          if (result && typeof result === 'object' && 'result' in result) {
            addLog('text:', result.result);
            if (typeof result.result === 'string') {
              setLatestText(result.result);
            } else {
              setLatestText(stringify(result.result));
            }
          }
        }
      });

      visionRef.current = vision;
      await vision.start();

      setStatus('Running (see logs below)');
      addLog('RealtimeVision started.');
    } catch (err) {
      setStatus('Error (see logs)');
      addLog('ERROR:', err?.stack || err);
    }
  }

  async function stop() {
    try {
      setStatus('Stopping…');
      if (visionRef.current) {
        await visionRef.current.stop();
        visionRef.current = null;
        addLog('RealtimeVision stopped.');
      }

      // Stop preview stream too (optional)
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      setStatus('Stopped');
    } catch (err) {
      setStatus('Stop error (see logs)');
      addLog('STOP ERROR:', err?.stack || err);
    }
  }

  // Cleanup on page refresh / HMR / unmount
  useEffect(() => {
    return () => {
      if (visionRef.current) {
        // best-effort stop
        visionRef.current.stop().catch(() => {});
        visionRef.current = null;
      }
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="page">
      <h1>Realtime Vision Demo</h1>
      <p className="status">
        Status: <strong>{status}</strong>
      </p>

      <div className="controls">
        <button onClick={start}>Start</button>
        <button onClick={stop}>Stop</button>
      </div>

      <div className="output">
        <div className="outputLabel">Latest model output</div>
        <textarea
          className="outputBox"
          readOnly
          value={latestText || 'No output yet. Click Start and point the camera at some text.'}
        />
      </div>

      <video ref={videoRef} autoPlay playsInline muted className="video" />

      <h3>Logs</h3>
      <pre className="log">{logs || 'No logs yet. Click Start.'}</pre>
    </div>
  );
}

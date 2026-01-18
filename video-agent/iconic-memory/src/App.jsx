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

  const originalGetUserMediaRef = useRef(null);
  const patchedRef = useRef(false);

  const [status, setStatus] = useState('Ready');
  const [latestText, setLatestText] = useState('');
  const [logs, setLogs] = useState('');

  function addLog(...args) {
    const line = args.map(stringify).join(' ');
    setLogs((prev) => (prev ? `${prev}\n${line}` : line));
    console.log(...args);
  }

  async function ensureScreenStream() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error(
        'Screen capture API not available. Use a modern browser and run on https:// or http://localhost.'
      );
    }
    if (previewStreamRef.current) return previewStreamRef.current;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 30,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    previewStreamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    const [track] = stream.getVideoTracks();
    track?.addEventListener('ended', () => {
      stop().catch(() => {});
    });

    return stream;
  }

  function patchGetUserMediaToReturn(stream) {
    if (patchedRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('navigator.mediaDevices.getUserMedia is not available.');
    }

    originalGetUserMediaRef.current = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );

    navigator.mediaDevices.getUserMedia = async () => {
      return stream;
    };

    patchedRef.current = true;
    addLog('Patched getUserMedia(): Overshoot camera will use screen share stream.');
  }

  function restoreGetUserMedia() {
    if (!patchedRef.current) return;
    if (originalGetUserMediaRef.current) {
      navigator.mediaDevices.getUserMedia = originalGetUserMediaRef.current;
    }
    originalGetUserMediaRef.current = null;
    patchedRef.current = false;
    addLog('Restored original getUserMedia().');
  }

  async function start() {
    try {
      setStatus('Requesting screen share permission…');
      const screenStream = await ensureScreenStream();

      patchGetUserMediaToReturn(screenStream);

      setStatus('Starting RealtimeVision…');
      addLog('Starting RealtimeVision…');

      const vision = createRealtimeVision({
        prompt: 'Describe what is happening on screen in one short sentence.',
        onResult: (result) => {
          addLog('onResult:', result);

          if (result && typeof result === 'object' && 'result' in result) {
            const out = result.result;
            addLog('text:', out);
            setLatestText(typeof out === 'string' ? out : stringify(out));
          }
        },
      });

      visionRef.current = vision;
      await vision.start();

      setStatus('Running (see logs below)');
      addLog('RealtimeVision started.');
    } catch (err) {
      setStatus('Error (see logs)');
      addLog('ERROR:', err?.stack || err);
      restoreGetUserMedia();
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

      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      restoreGetUserMedia();

      setStatus('Stopped');
    } catch (err) {
      setStatus('Stop error (see logs)');
      addLog('STOP ERROR:', err?.stack || err);
      restoreGetUserMedia();
    }
  }

  useEffect(() => {
    return () => {
      if (visionRef.current) {
        visionRef.current.stop().catch(() => {});
        visionRef.current = null;
      }
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      restoreGetUserMedia();
    };
  }, []);

  return (
    <div className="page">
      <h1>Realtime Vision Demo (Screen)</h1>
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
          value={
            latestText ||
            'No output yet. Click Start and share a screen/window/tab.'
          }
        />
      </div>

      <video ref={videoRef} autoPlay playsInline muted className="video" />

      <h3>Logs</h3>
      <pre className="log">{logs || 'No logs yet. Click Start.'}</pre>
    </div>
  );
}
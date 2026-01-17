import { RealtimeVision } from '@overshoot/sdk';

const STORAGE_KEY = 'OVS_API_KEY';

export function getOvershootApiKey() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const entered = window.prompt(
    'Paste your Overshoot API key (stored in this browser localStorage):'
  );
  if (!entered) return '';
  localStorage.setItem(STORAGE_KEY, entered);
  return entered;
}

export function clearOvershootApiKey() {
  localStorage.removeItem(STORAGE_KEY);
}

export function createRealtimeVision({ onResult, prompt = 'Read any visible text' } = {}) {
  const apiKey = getOvershootApiKey();
  if (!apiKey) {
    throw new Error('Missing Overshoot API key.');
  }

  return new RealtimeVision({
    apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
    apiKey,
    prompt,
    onResult
  });
}
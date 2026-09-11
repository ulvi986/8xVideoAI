import { gemini } from './gemini.js';
import { simulator } from './simulator.js';

const PROVIDERS = { gemini, simulator };

export function getProvider(id) {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}

export { ProviderError } from './gemini.js';

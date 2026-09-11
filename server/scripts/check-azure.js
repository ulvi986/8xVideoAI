#!/usr/bin/env node
/*
 * Verifies the Azure OpenAI settings used for prompt rewriting.
 *   node scripts/check-azure.js
 */
import { config } from '../src/config.js';
import { enhancePrompt, hasAzure } from '../src/azure.js';

if (!hasAzure()) {
  console.log('\n  Azure prompt rewriting: NOT CONFIGURED');
  console.log('  Needs AZURE_OPENAI_ENDPOINT, AZURE_AI_API_KEY and AZURE_AI_MODEL.\n');
  process.exit(1);
}

console.log(`\n  endpoint : ${config.azureEndpoint}`);
console.log(`  model    : ${config.azureModel}`);
console.log(`  version  : ${config.azureApiVersion}\n`);

const started = Date.now();
try {
  const { enhanced, usage } = await enhancePrompt({ kind: 'video', prompt: 'a cat in a city' });
  console.log(`  OK in ${((Date.now() - started) / 1000).toFixed(1)}s, ${usage?.total_tokens ?? '?'} tokens\n`);
  console.log(`  "a cat in a city"  ->\n\n  ${enhanced}\n`);
} catch (err) {
  console.log(`  FAILED: ${err.message}\n`);
  process.exit(1);
}

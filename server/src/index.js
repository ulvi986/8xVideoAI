import { app } from './app.js';
import { config, hasGemini } from './config.js';
import { ensureReady, requeueOrphanedJobs } from './db.js';
import { hasAzure } from './azure.js';
import { usingBlob } from './storage.js';

/*
 * Local entry point. The serverless one is api/index.js, which imports the
 * same app and never calls listen().
 */

await ensureReady();

const requeued = await requeueOrphanedJobs();
if (requeued) console.log(`[boot] re-queued ${requeued} job(s) interrupted by a restart`);

app.listen(config.port, () => {
  console.log(`\n  8xBuildAI API  →  http://localhost:${config.port}`);
  console.log(`  gemini         →  ${hasGemini() ? 'configured' : 'NOT configured (local renderer only)'}`);
  console.log(`  simulator      →  ${config.allowSimulator ? 'enabled' : 'disabled'}`);
  console.log(`  prompt rewriter→  ${hasAzure() ? `Azure ${config.azureModel}` : 'NOT configured'}`);
  console.log(`  database       →  ${config.databaseUrl ? 'libsql (remote)' : 'libsql (local file)'}`);
  console.log(`  media          →  ${usingBlob() ? 'vercel blob' : 'local disk'}`);
  if (!config.sessionSecretProvided) {
    console.log('  note           →  SESSION_SECRET not set; sessions reset on restart\n');
  } else {
    console.log('');
  }
});

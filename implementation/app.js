const path = require('node:path');
const { spawn } = require('node:child_process');
const tripleStore = require('./triple-store/store');
const { runPipeline } = require('./etl/import');
const { startServer } = require('./api/server');

// ETL and HTTP intentionally share this exact in-process store.
async function startApplication({ store = tripleStore, sampleDataDir, apiPort = 3000, ui = true } = {}) {
  await store.initialize();
  await runPipeline({ store, sampleDataDir });
  const apiServer = await startServer({ store, port: apiPort });
  const uiServer = ui ? spawn(process.execPath, [path.join(__dirname, 'ui', 'server.js')], { stdio: 'inherit' }) : null;
  return { apiServer, uiServer, close: async () => {
    if (uiServer) uiServer.kill();
    await new Promise((resolve, reject) => apiServer.close(error => error ? reject(error) : resolve()));
  } };
}
if (require.main === module) {
  startApplication().then(application => {
    console.log('Reference API ready at http://127.0.0.1:3000 (in-memory, not durable)');
    process.once('SIGINT', () => application.close().then(() => process.exit(0)));
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { startApplication };

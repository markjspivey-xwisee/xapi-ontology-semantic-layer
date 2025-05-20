const path = require('path');
const { spawn } = require('child_process');
const tripleStore = require('./triple-store/store');
const etl = require('./etl/import');

// Main application that coordinates all components
async function startApplication() {
  console.log('🚀 Starting xAPI Ontology and Semantic Layer Implementation');
  
  try {
    // 1. Initialize the triple store
    console.log('\n📦 Initializing Triple Store...');
    await tripleStore.initialize();
    console.log('✅ Triple Store initialized successfully');
    
    // 2. Run the ETL pipeline to load data
    console.log('\n🔄 Running ETL Pipeline...');
    await etl.runPipeline();
    console.log('✅ ETL Pipeline completed successfully');
    
    // 3. Start the API server in a child process
    console.log('\n🌐 Starting API Server...');
    const apiServer = spawn('node', [path.join(__dirname, 'api', 'server.js')], {
      stdio: 'inherit'
    });
    
    apiServer.on('error', (error) => {
      console.error('❌ API Server error:', error);
    });
    
    // 4. Start the UI server in a child process
    console.log('\n🖥️ Starting UI Server...');
    const uiServer = spawn('node', [path.join(__dirname, 'ui', 'server.js')], {
      stdio: 'inherit'
    });
    
    uiServer.on('error', (error) => {
      console.error('❌ UI Server error:', error);
    });
    
    console.log('\n🎉 All components started successfully!');
    console.log('📝 Visit http://localhost:3001 to access the UI');
    console.log('🔍 API documentation available at http://localhost:3000/api-docs');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down...');
      
      // Kill child processes
      apiServer.kill();
      uiServer.kill();
      
      // Exit the process
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error starting application:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  startApplication();
}

module.exports = { startApplication };

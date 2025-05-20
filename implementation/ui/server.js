const express = require('express');
const path = require('path');
const fs = require('fs');

// Create Express app
const app = express();
const port = 3001; // Different from API port

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API proxy route
app.get('/api/*', (req, res) => {
  res.redirect(`http://localhost:3000${req.url.replace('/api', '')}`);
});

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Make sure the public directory exists
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Create HTML files
const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>xAPI Ontology Explorer</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { padding-top: 20px; }
    .json-container { background-color: #f8f9fa; padding: 15px; border-radius: 5px; }
    pre { margin-bottom: 0; }
    .nav-pills .nav-link.active { background-color: #0d6efd; }
  </style>
</head>
<body>
  <div class="container">
    <header class="pb-3 mb-4 border-bottom">
      <h1 class="display-5 fw-bold">xAPI Ontology Explorer</h1>
      <p class="lead">Explore the xAPI ontology, semantic layer, and learning experience data</p>
    </header>

    <div class="row mb-4">
      <div class="col">
        <div class="card">
          <div class="card-header">
            Knowledge Graph Navigation
          </div>
          <div class="card-body">
            <ul class="nav nav-pills" id="mainNav">
              <li class="nav-item">
                <a class="nav-link active" id="statements-tab" href="#">Statements</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" id="actors-tab" href="#">Actors</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" id="verbs-tab" href="#">Verbs</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" id="activities-tab" href="#">Activities</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" id="query-tab" href="#">SPARQL Query</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div id="statementsPanel" class="panel">
      <div class="row mb-4">
        <div class="col">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span>xAPI Statements</span>
              <button class="btn btn-primary btn-sm" id="refreshStatements">Refresh</button>
            </div>
            <div class="card-body">
              <div id="statements-container" class="json-container">
                <pre id="statements-json">Loading statements...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div id="actorsPanel" class="panel d-none">
      <div class="row mb-4">
        <div class="col">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span>xAPI Actors</span>
              <button class="btn btn-primary btn-sm" id="refreshActors">Refresh</button>
            </div>
            <div class="card-body">
              <div id="actors-container" class="json-container">
                <pre id="actors-json">Loading actors...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div id="verbsPanel" class="panel d-none">
      <div class="row mb-4">
        <div class="col">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span>xAPI Verbs</span>
              <button class="btn btn-primary btn-sm" id="refreshVerbs">Refresh</button>
            </div>
            <div class="card-body">
              <div id="verbs-container" class="json-container">
                <pre id="verbs-json">Loading verbs...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div id="activitiesPanel" class="panel d-none">
      <div class="row mb-4">
        <div class="col">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span>xAPI Activities</span>
              <button class="btn btn-primary btn-sm" id="refreshActivities">Refresh</button>
            </div>
            <div class="card-body">
              <div id="activities-container" class="json-container">
                <pre id="activities-json">Loading activities...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div id="queryPanel" class="panel d-none">
      <div class="row mb-4">
        <div class="col">
          <div class="card">
            <div class="card-header">
              <span>SPARQL Query</span>
            </div>
            <div class="card-body">
              <div class="mb-3">
                <label for="sparqlQuery" class="form-label">Enter your SPARQL query:</label>
                <textarea class="form-control" id="sparqlQuery" rows="5">
PREFIX xapi: <http://adlnet.gov/expapi/ontology/>
SELECT ?statement ?actor ?verb ?object
WHERE {
  ?statement a xapi:Statement .
  ?statement xapi:actor ?actor .
  ?statement xapi:verb ?verb .
  ?statement xapi:object ?object .
}
LIMIT 10</textarea>
              </div>
              <button class="btn btn-primary" id="runQuery">Run Query</button>
            </div>
          </div>
        </div>
      </div>
      <div class="row mb-4">
        <div class="col">
          <div class="card">
            <div class="card-header">Query Results</div>
            <div class="card-body">
              <div id="query-results-container" class="json-container">
                <pre id="query-results">Run a query to see results</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="row mb-4">
      <div class="col">
        <div class="card">
          <div class="card-header">
            <span>API Documentation</span>
          </div>
          <div class="card-body">
            <p>Explore the RESTful HATEOAS API:</p>
            <a href="http://localhost:3000/api-docs" target="_blank" class="btn btn-outline-primary">Open API Docs</a>
          </div>
        </div>
      </div>
    </div>
    
    <footer class="pt-3 mt-4 text-muted border-top">
      &copy; 2025 xAPI Ontology Working Group
    </footer>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    // API base URL
    const API_BASE = 'http://localhost:3000';
    
    // Utility function to prettify JSON
    function prettyJson(obj) {
      return JSON.stringify(obj, null, 2);
    }
    
    // Function to show a specific panel
    function showPanel(panelId) {
      document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.add('d-none');
      });
      document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
      });
      
      document.getElementById(panelId).classList.remove('d-none');
      document.getElementById(panelId.replace('Panel', '-tab')).classList.add('active');
    }
    
    // Load statements
    async function loadStatements() {
      try {
        const response = await fetch(\`\${API_BASE}/statements\`);
        const data = await response.json();
        document.getElementById('statements-json').textContent = prettyJson(data);
      } catch (error) {
        document.getElementById('statements-json').textContent = \`Error loading statements: \${error.message}\`;
      }
    }
    
    // Load actors
    async function loadActors() {
      try {
        const response = await fetch(\`\${API_BASE}/agents\`);
        const data = await response.json();
        document.getElementById('actors-json').textContent = prettyJson(data);
      } catch (error) {
        document.getElementById('actors-json').textContent = \`Error loading actors: \${error.message}\`;
      }
    }
    
    // Load verbs
    async function loadVerbs() {
      try {
        const response = await fetch(\`\${API_BASE}/verbs\`);
        const data = await response.json();
        document.getElementById('verbs-json').textContent = prettyJson(data);
      } catch (error) {
        document.getElementById('verbs-json').textContent = \`Error loading verbs: \${error.message}\`;
      }
    }
    
    // Load activities
    async function loadActivities() {
      try {
        const response = await fetch(\`\${API_BASE}/activities\`);
        const data = await response.json();
        document.getElementById('activities-json').textContent = prettyJson(data);
      } catch (error) {
        document.getElementById('activities-json').textContent = \`Error loading activities: \${error.message}\`;
      }
    }
    
    // Run SPARQL query
    async function runSparqlQuery() {
      try {
        const query = encodeURIComponent(document.getElementById('sparqlQuery').value);
        const response = await fetch(\`\${API_BASE}/sparql?query=\${query}\`);
        const data = await response.json();
        document.getElementById('query-results').textContent = prettyJson(data);
      } catch (error) {
        document.getElementById('query-results').textContent = \`Error running query: \${error.message}\`;
      }
    }
    
    // Initialize page
    function init() {
      // Load initial data
      loadStatements();
      
      // Add event listeners for tabs
      document.getElementById('statements-tab').addEventListener('click', (e) => {
        e.preventDefault();
        showPanel('statementsPanel');
      });
      
      document.getElementById('actors-tab').addEventListener('click', (e) => {
        e.preventDefault();
        showPanel('actorsPanel');
        loadActors();
      });
      
      document.getElementById('verbs-tab').addEventListener('click', (e) => {
        e.preventDefault();
        showPanel('verbsPanel');
        loadVerbs();
      });
      
      document.getElementById('activities-tab').addEventListener('click', (e) => {
        e.preventDefault();
        showPanel('activitiesPanel');
        loadActivities();
      });
      
      document.getElementById('query-tab').addEventListener('click', (e) => {
        e.preventDefault();
        showPanel('queryPanel');
      });
      
      // Add refresh button handlers
      document.getElementById('refreshStatements').addEventListener('click', loadStatements);
      document.getElementById('refreshActors').addEventListener('click', loadActors);
      document.getElementById('refreshVerbs').addEventListener('click', loadVerbs);
      document.getElementById('refreshActivities').addEventListener('click', loadActivities);
      document.getElementById('runQuery').addEventListener('click', runSparqlQuery);
    }
    
    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', init);
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);

// Start the server
app.listen(port, () => {
  console.log(`xAPI Ontology UI server running at http://localhost:${port}`);
});

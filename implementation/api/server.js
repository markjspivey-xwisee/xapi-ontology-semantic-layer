const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const hateoasLinker = require('express-hateoas-links');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const uuid = require('uuid');

// Import our triple store
const tripleStore = require('../triple-store/store');

// Create Express app
const app = express();
const port = 3000;

// Replace Express's default json response with HATEOAS enabled version
app.use(hateoasLinker);

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Load OpenAPI specification
const openApiPath = path.join(__dirname, '..', '..', 'rest-api', 'openapi.yaml');
let openApiSpec = {};

try {
  const openApiFile = fs.readFileSync(openApiPath, 'utf8');
  openApiSpec = yaml.load(openApiFile);
  console.log('Loaded OpenAPI specification');
} catch (error) {
  console.error('Error loading OpenAPI specification:', error);
  openApiSpec = { 
    info: { 
      title: 'xAPI Ontology API', 
      version: '1.0.0',
      description: 'Error loading spec file' 
    }
  };
}

// Serve Swagger UI documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// API root with hypermedia links
app.get('/', (req, res) => {
  res.json({
    message: 'xAPI Ontology and Semantic Layer API',
    _links: {
      self: { href: '/' },
      statements: { href: '/statements' },
      activities: { href: '/activities' },
      agents: { href: '/agents' },
      verbs: { href: '/verbs' },
      documentation: { href: '/api-docs' }
    },
    version: '1.0.0'
  });
});

// Get statements with filters
app.get('/statements', async (req, res) => {
  try {
    // Parse query parameters
    const filters = {
      actorId: req.query.actor,
      verbId: req.query.verb,
      objectId: req.query.activity,
      since: req.query.since,
      until: req.query.until,
      limit: parseInt(req.query.limit) || 50
    };
    
    const result = await tripleStore.getStatements(filters);
    
    if (result.success) {
      const statements = result.statements.map(stmt => {
        // Add hypermedia links to each statement
        const statement = stmt.statement ? stmt.statement.value : null;
        
        return {
          ...stmt,
          _links: {
            self: { href: `/statements/${statement}` },
            actor: { href: `/agents/${stmt.actor?.value}` },
            verb: { href: `/verbs/${encodeURIComponent(stmt.verb?.value)}` },
            object: { href: `/activities/${encodeURIComponent(stmt.object?.value)}` }
          }
        };
      });
      
      // Create a HAL response with links
      res.json({
        _links: {
          self: { href: `/statements${req._parsedUrl.search || ''}` },
          first: { href: '/statements?page=1' },
          next: { href: '/statements?page=2' }
        },
        count: statements.length,
        statements: statements
      });
    } else {
      res.status(500).json({ 
        error: 'Error retrieving statements',
        message: result.error 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      error: 'Server error',
      message: error.message 
    });
  }
});

// Get a specific statement by ID
app.get('/statements/:id', async (req, res) => {
  try {
    const statementId = req.params.id;
    
    // Build a SPARQL query to get a specific statement
    const sparqlQuery = `
      PREFIX xapi: <http://adlnet.gov/expapi/ontology/>
      SELECT *
      WHERE {
        <${statementId}> ?p ?o .
      }
    `;
    
    const result = await tripleStore.executeQuery(sparqlQuery);
    
    if (result && result.length > 0) {
      // Transform the flat result into a nested structure
      const statement = {};
      
      result.forEach(triple => {
        const predicate = triple.p.value.split('/').pop();
        statement[predicate] = triple.o.value;
      });
      
      // Add hypermedia links
      res.json({
        ...statement,
        _links: {
          self: { href: `/statements/${statementId}` },
          collection: { href: '/statements' }
        }
      });
    } else {
      res.status(404).json({ 
        error: 'Statement not found',
        id: statementId 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      error: 'Server error',
      message: error.message 
    });
  }
});

// Create a new statement
app.post('/statements', async (req, res) => {
  try {
    const statement = req.body;
    
    // Generate an ID if not provided
    if (!statement.id) {
      statement.id = uuid.v4();
    }
    
    const result = await tripleStore.addStatement(statement);
    
    if (result.success) {
      res.status(201)
         .header('Location', `/statements/${statement.id}`)
         .json({
           id: statement.id,
           _links: {
             self: { href: `/statements/${statement.id}` },
             collection: { href: '/statements' }
           }
         });
    } else {
      res.status(400).json({ 
        error: 'Error storing statement',
        message: result.error 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      error: 'Server error',
      message: error.message 
    });
  }
});

// Get all verbs
app.get('/verbs', async (req, res) => {
  try {
    // Build a SPARQL query to get all verbs
    const sparqlQuery = `
      PREFIX xapi: <http://adlnet.gov/expapi/ontology/>
      SELECT DISTINCT ?verb ?id ?display
      WHERE {
        ?verb a xapi:Verb .
        ?verb xapi:id ?id .
        OPTIONAL { ?verb xapi:display ?display . }
      }
    `;
    
    const result = await tripleStore.executeQuery(sparqlQuery);
    
    const verbs = result.map(v => ({
      id: v.id.value,
      display: v.display ? v.display.value : undefined,
      _links: {
        self: { href: `/verbs/${encodeURIComponent(v.id.value)}` }
      }
    }));
    
    res.json({
      _links: {
        self: { href: '/verbs' }
      },
      count: verbs.length,
      verbs: verbs
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Server error',
      message: error.message 
    });
  }
});

// Get all activities
app.get('/activities', async (req, res) => {
  try {
    // Build a SPARQL query to get all activities
    const sparqlQuery = `
      PREFIX xapi: <http://adlnet.gov/expapi/ontology/>
      SELECT DISTINCT ?activity ?id ?name ?type
      WHERE {
        ?activity a xapi:Activity .
        ?activity xapi:id ?id .
        OPTIONAL { ?activity xapi:name ?name . }
        OPTIONAL { ?activity xapi:type ?type . }
      }
    `;
    
    const result = await tripleStore.executeQuery(sparqlQuery);
    
    const activities = result.map(a => ({
      id: a.id.value,
      name: a.name ? a.name.value : undefined,
      type: a.type ? a.type.value : undefined,
      _links: {
        self: { href: `/activities/${encodeURIComponent(a.id.value)}` }
      }
    }));
    
    res.json({
      _links: {
        self: { href: '/activities' }
      },
      count: activities.length,
      activities: activities
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Server error',
      message: error.message 
    });
  }
});

// Get all agents
app.get('/agents', async (req, res) => {
  try {
    // Build a SPARQL query to get all agents
    const sparqlQuery = `
      PREFIX xapi: <http://adlnet.gov/expapi/ontology/>
      SELECT DISTINCT ?agent ?mbox ?name
      WHERE {
        ?agent a xapi:Agent .
        OPTIONAL { ?agent xapi:mbox ?mbox . }
        OPTIONAL { ?agent xapi:name ?name . }
      }
    `;
    
    const result = await tripleStore.executeQuery(sparqlQuery);
    
    const agents = result.map(a => ({
      mbox: a.mbox ? a.mbox.value : undefined,
      name: a.name ? a.name.value : undefined,
      _links: {
        self: { href: `/agents/${encodeURIComponent(a.mbox ? a.mbox.value : a.agent.value)}` },
        statements: { href: `/statements?agent=${encodeURIComponent(a.mbox ? a.mbox.value : a.agent.value)}` }
      }
    }));
    
    res.json({
      _links: {
        self: { href: '/agents' }
      },
      count: agents.length,
      agents: agents
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Server error',
      message: error.message 
    });
  }
});

// JSON-LD Context endpoint
app.get('/contexts/:name', (req, res) => {
  const contextName = req.params.name;
  const contextPath = path.join(__dirname, '..', '..', 'rest-api', 'jsonld-context', `${contextName}.jsonld`);
  
  try {
    if (fs.existsSync(contextPath)) {
      const contextData = fs.readFileSync(contextPath, 'utf8');
      res.type('application/ld+json').send(contextData);
    } else {
      res.status(404).json({
        error: 'Context not found',
        context: contextName
      });
    }
  } catch (error) {
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

// Start the server
async function startServer() {
  try {
    // Make sure the triple store is initialized
    await tripleStore.initialize();
    
    app.listen(port, () => {
      console.log(`xAPI Ontology API server running at http://localhost:${port}`);
      console.log(`API documentation available at http://localhost:${port}/api-docs`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

// Start the server
startServer();

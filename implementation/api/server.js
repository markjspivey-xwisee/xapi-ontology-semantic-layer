const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const hateoasLinker = require('express-hateoas-links');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const uuid = require('uuid');
const { Parser } = require('sparqljs');
const { UUID, loadPinnedContext } = require('../statement-projection');

// Import our triple store
const defaultStore = require('../triple-store/store');

// Create Express app
function createApp({ store: tripleStore = defaultStore } = {}) {
const app = express();

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
      query: { href: '/sparql' },
      context: { href: '/contexts/statement-context' },
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
    if (['since', 'until'].some(key => filters[key] && !Number.isFinite(Date.parse(filters[key])))) {
      return res.status(400).json({ error: 'invalid_timestamp_filter' });
    }
    
    const result = await tripleStore.getStatements(filters);
    
    if (result.success) {
      const statements = result.statements.map(stmt => {
        // Add hypermedia links to each statement
        const statement = stmt.statement ? stmt.statement.value : null;
        const statementId = statement && statement.startsWith('urn:uuid:') ? statement.slice(9) : statement;
        
        return {
          ...stmt,
          _links: {
            self: { href: '/statements/' + statementId },
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

// Original JSON is retained independently of RDF expansion and never flattened.
app.get('/statements/:id', (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'invalid_statement_id' });
  const original = tripleStore.getOriginal(req.params.id);
  if (!original) return res.status(404).json({ error: 'Statement not found' });
  res.json(original);
});

app.get('/statements/:id/:representation', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'invalid_statement_id' });
  if (req.params.representation === 'provenance') {
    const projection = tripleStore.getProjection(req.params.id);
    if (!projection) return res.status(404).json({ error: 'Statement not found' });
    return res.json({
      id: projection.original.id, legacyIri: projection.legacyIri, recordIri: projection.recordIri,
      sourceDocumentIri: projection.sourceDocumentIri, sourceJsonCanonicalSha256: projection.sourceSha256,
      contextCanonicalSha256: projection.contextSha256, sourceModel: projection.sourceModel,
      targetOntologyVersion: 'https://foxxi-bridge.interego.xwisee.com/ns/xapi/2026.10.1',
      sourceProtocolVersion: projection.original.version || null, adapter: projection.adapter, storage: 'in-memory'
    });
  }
  if (!['legacy', 'record'].includes(req.params.representation)) return res.status(404).json({ error: 'Unknown representation' });
  const format = req.accepts(['application/ld+json', 'text/turtle']);
  if (!format) return res.status(406).json({ error: 'Use application/ld+json or text/turtle' });
  try {
    const data = await tripleStore.exportStatement(req.params.id, req.params.representation, format === 'text/turtle' ? 'turtle' : 'jsonld');
    if (data === undefined) return res.status(404).json({ error: 'Statement not found' });
    res.type(format).send(data);
  } catch (error) { res.status(500).json({ error: 'RDF export failed', message: error.message }); }
});

// The source-qualified adapter, not arbitrary client RDF, licenses the record type.
app.post('/statements', async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'invalid_statement' });
  const statement = { ...req.body };
  if (statement.id === undefined) statement.id = uuid.v4();
  const result = await tripleStore.addStatement(statement);
  if (!result.success) {
    const status = result.code === 'statement_conflict' ? 409 : result.code === 'invalid_statement' ? 400 : 500;
    return res.status(status).json({ error: result.code, message: result.error });
  }
  res.status(result.duplicate ? 200 : 201).header('Location', '/statements/' + result.id).json({
    id: result.id, duplicate: result.duplicate, recordIri: result.recordIri,
    _links: { self: { href: '/statements/' + result.id }, collection: { href: '/statements' },
      legacy: { href: '/statements/' + result.id + '/legacy' }, record: { href: '/statements/' + result.id + '/record' } }
  });
});

// A local read-only query surface: no updates or federated SERVICE/network access.
app.get('/sparql', async (req, res) => {
  try {
    if (typeof req.query.query !== 'string' || req.query.query.length > 16384) throw new Error('A bounded query is required');
    const parsed = new Parser().parse(req.query.query);
    const hasService = value => value && typeof value === 'object' &&
      (value.type === 'service' || Object.values(value).some(item => Array.isArray(item) ? item.some(hasService) : hasService(item)));
    if (parsed.type !== 'query' || !['SELECT', 'ASK'].includes(parsed.queryType) || hasService(parsed)) throw new Error('Only local SELECT and ASK are supported');
    res.json({ results: await tripleStore.executeQuery(req.query.query) });
  } catch (error) { res.status(400).json({ error: 'invalid_query', message: error.message }); }
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
  if (!['statement', 'statement-context'].includes(contextName)) return res.status(404).json({ error: 'Context not found' });
  
  try {
    res.type('application/ld+json').send({ '@context': loadPinnedContext() });
  } catch (error) {
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

return app;
}

async function startServer({ store = defaultStore, port = 3000, host = '127.0.0.1' } = {}) {
  await store.initialize();
  const app = createApp({ store });
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.once('error', reject);
  });
}
if (require.main === module) startServer().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createApp, startServer };

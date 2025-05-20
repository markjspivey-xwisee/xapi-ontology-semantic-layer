const fs = require('fs');
const path = require('path');
const N3 = require('n3');
const rdfstore = require('rdfstore');
const { promisify } = require('util');

// Create a class for managing the Triple Store
class XapiTripleStore {
  constructor() {
    this.store = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    // Create a new RDF store
    const createStore = promisify(rdfstore.create);
    this.store = await createStore();
    
    // Load ontology files
    await this.loadOntology();
    
    this.initialized = true;
    console.log('Triple store initialized');
  }

  async loadOntology() {
    try {
      // Load the core xAPI ontology
      const ontologyPath = path.join(__dirname, '..', '..', 'ontology', 'xapi.ttl');
      const shapesPath = path.join(__dirname, '..', '..', 'ontology', 'xapi-shapes.ttl');
      
      console.log('Loading ontology from:', ontologyPath);
      
      if (fs.existsSync(ontologyPath)) {
        const ontologyData = fs.readFileSync(ontologyPath, 'utf8');
        await this.importTurtleData(ontologyData, 'http://adlnet.gov/expapi/ontology/');
        console.log('Loaded xAPI ontology successfully');
      } else {
        console.error('Ontology file not found:', ontologyPath);
      }
      
      if (fs.existsSync(shapesPath)) {
        const shapesData = fs.readFileSync(shapesPath, 'utf8');
        await this.importTurtleData(shapesData, 'http://adlnet.gov/expapi/ontology/shapes');
        console.log('Loaded xAPI shapes successfully');
      } else {
        console.error('Shapes file not found:', shapesPath);
      }
    } catch (error) {
      console.error('Error loading ontology:', error);
    }
  }

  async importTurtleData(turtleData, graphUri) {
    return new Promise((resolve, reject) => {
      this.store.load('text/turtle', turtleData, graphUri, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }

  async importJsonldData(jsonldData, graphUri) {
    return new Promise((resolve, reject) => {
      this.store.load('application/ld+json', JSON.stringify(jsonldData), graphUri, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }

  async addStatement(statement, graphUri = 'http://example.org/xapi/statements/') {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Convert statement to JSON-LD with context
      const jsonld = this.statementToJsonLd(statement);
      
      // Import into store
      await this.importJsonldData(jsonld, graphUri);
      
      return { success: true, id: statement.id };
    } catch (error) {
      console.error('Error adding statement:', error);
      return { success: false, error: error.message };
    }
  }

  statementToJsonLd(statement) {
    // Add JSON-LD context to the xAPI statement
    return {
      "@context": "http://example.org/xapi/contexts/statement",
      ...statement
    };
  }

  async executeQuery(sparqlQuery) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return new Promise((resolve, reject) => {
      this.store.execute(sparqlQuery, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }

  async getStatements(filters = {}) {
    // Build a SPARQL query from filters
    let sparqlQuery = `
      PREFIX xapi: <http://adlnet.gov/expapi/ontology/>
      SELECT ?statement ?actor ?verb ?object ?timestamp
      WHERE {
        ?statement a xapi:Statement .
        ?statement xapi:actor ?actor .
        ?statement xapi:verb ?verb .
        ?statement xapi:object ?object .
        OPTIONAL { ?statement xapi:timestamp ?timestamp . }
    `;
    
    // Add filters if provided
    if (filters.actorId) {
      sparqlQuery += `\n?actor xapi:mbox "${filters.actorId}" .`;
    }
    
    if (filters.verbId) {
      sparqlQuery += `\n?verb xapi:id <${filters.verbId}> .`;
    }
    
    if (filters.objectId) {
      sparqlQuery += `\n?object xapi:id <${filters.objectId}> .`;
    }
    
    // Close the query
    sparqlQuery += '\n}';
    
    try {
      const results = await this.executeQuery(sparqlQuery);
      return {
        success: true,
        statements: results
      };
    } catch (error) {
      console.error('Error executing SPARQL query:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export a singleton instance
const tripleStore = new XapiTripleStore();
module.exports = tripleStore;

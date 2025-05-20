const fs = require('fs');
const path = require('path');
const N3 = require('n3');
const jsonld = require('jsonld');
const tripleStore = require('../triple-store/store');

// ETL Pipeline for xAPI data
class XapiEtlPipeline {
  constructor() {
    this.sampleDataDir = path.join(__dirname, 'sample-data');
    this.jsonldContext = path.join(__dirname, '..', '..', 'rest-api', 'jsonld-context', 'statement-context.jsonld');
  }

  // Initialize the pipeline and process sample data
  async initialize() {
    // Ensure the sample data directory exists
    this.ensureSampleDataDirExists();
    
    // Create sample xAPI statements if none exist
    await this.createSampleDataIfNeeded();
    
    // Process all xAPI statements in the sample data directory
    await this.processAllStatements();
    
    console.log('ETL pipeline initialization complete');
  }

  ensureSampleDataDirExists() {
    if (!fs.existsSync(this.sampleDataDir)) {
      fs.mkdirSync(this.sampleDataDir, { recursive: true });
      console.log(`Created sample data directory: ${this.sampleDataDir}`);
    }
  }

  // Create sample data files if none exist
  async createSampleDataIfNeeded() {
    const sampleFiles = this.getSampleFiles();
    
    if (sampleFiles.length === 0) {
      console.log('No sample data files found. Creating samples...');
      await this.generateSampleData();
    } else {
      console.log(`Found ${sampleFiles.length} existing sample files`);
    }
  }

  // Get list of sample files
  getSampleFiles() {
    try {
      return fs.readdirSync(this.sampleDataDir)
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(this.sampleDataDir, file));
    } catch (error) {
      console.error('Error reading sample directory:', error);
      return [];
    }
  }

  // Generate sample xAPI statements
  async generateSampleData() {
    // Sample data from our functional-test.js
    const sampleStatements = [
      {
        "id": "12345678-1234-5678-1234-567812345678",
        "actor": {
          "objectType": "Agent",
          "name": "John Doe",
          "mbox": "mailto:john.doe@example.com"
        },
        "verb": {
          "id": "http://adlnet.gov/expapi/verbs/completed",
          "display": {
            "en-US": "completed"
          }
        },
        "object": {
          "objectType": "Activity",
          "id": "http://example.com/activities/module1",
          "definition": {
            "name": {
              "en-US": "Introduction to Semantic Web"
            },
            "description": {
              "en-US": "An introductory course on semantic web technologies"
            },
            "type": "http://adlnet.gov/expapi/activities/course"
          }
        },
        "result": {
          "score": {
            "scaled": 0.85,
            "raw": 85,
            "min": 0,
            "max": 100
          },
          "success": true,
          "completion": true,
          "duration": "PT1H30M"
        },
        "context": {
          "registration": "67890123-4567-8901-2345-678901234567",
          "platform": "Learning Management System",
          "language": "en-US",
          "contextActivities": {
            "parent": {
              "id": "http://example.com/activities/semantic-web-course"
            }
          }
        },
        "timestamp": "2025-05-19T19:30:00.000Z"
      },
      {
        "id": "87654321-8765-4321-8765-432187654321",
        "actor": {
          "objectType": "Agent",
          "name": "Jane Smith",
          "mbox": "mailto:jane.smith@example.com"
        },
        "verb": {
          "id": "http://adlnet.gov/expapi/verbs/attempted",
          "display": {
            "en-US": "attempted"
          }
        },
        "object": {
          "objectType": "Activity",
          "id": "http://example.com/activities/quiz1",
          "definition": {
            "name": {
              "en-US": "RDF Basics Quiz"
            },
            "description": {
              "en-US": "A quiz testing knowledge of basic RDF concepts"
            },
            "type": "http://adlnet.gov/expapi/activities/assessment"
          }
        },
        "context": {
          "registration": "67890123-4567-8901-2345-678901234567",
          "contextActivities": {
            "parent": {
              "id": "http://example.com/activities/module1"
            },
            "grouping": {
              "id": "http://example.com/activities/semantic-web-course"
            }
          }
        },
        "timestamp": "2025-05-19T19:15:00.000Z"
      },
      {
        "id": "13579246-1357-9246-1357-924613579246",
        "actor": {
          "objectType": "Agent",
          "name": "John Doe",
          "mbox": "mailto:john.doe@example.com"
        },
        "verb": {
          "id": "http://adlnet.gov/expapi/verbs/answered",
          "display": {
            "en-US": "answered"
          }
        },
        "object": {
          "objectType": "Activity",
          "id": "http://example.com/activities/question1",
          "definition": {
            "name": {
              "en-US": "What is RDF?"
            },
            "description": {
              "en-US": "Question about the Resource Description Framework"
            },
            "type": "http://adlnet.gov/expapi/activities/question"
          }
        },
        "result": {
          "response": "Resource Description Framework is a standard model for data interchange on the Web.",
          "success": true,
          "completion": true
        },
        "context": {
          "registration": "67890123-4567-8901-2345-678901234567",
          "contextActivities": {
            "parent": {
              "id": "http://example.com/activities/quiz1"
            },
            "grouping": {
              "id": "http://example.com/activities/module1"
            }
          }
        },
        "timestamp": "2025-05-19T19:20:00.000Z"
      }
    ];
    
    // Save each statement to a file
    for (let i = 0; i < sampleStatements.length; i++) {
      const statement = sampleStatements[i];
      const filePath = path.join(this.sampleDataDir, `statement_${i + 1}.json`);
      
      fs.writeFileSync(filePath, JSON.stringify(statement, null, 2));
      console.log(`Created sample statement file: ${filePath}`);
    }
    
    return sampleStatements;
  }

  // Process all statements in the sample data directory
  async processAllStatements() {
    const files = this.getSampleFiles();
    console.log(`Processing ${files.length} xAPI statement files...`);
    
    for (const file of files) {
      try {
        console.log(`Processing ${path.basename(file)}`);
        const statement = JSON.parse(fs.readFileSync(file, 'utf8'));
        
        // Transform and load the statement
        await this.processStatement(statement);
      } catch (error) {
        console.error(`Error processing ${file}:`, error);
      }
    }
  }

  // Process a single statement - transform and load it to the triple store
  async processStatement(statement) {
    try {
      // Load the JSON-LD context
      let context = {};
      try {
        if (fs.existsSync(this.jsonldContext)) {
          context = JSON.parse(fs.readFileSync(this.jsonldContext, 'utf8'));
        } else {
          console.warn('JSON-LD context file not found:', this.jsonldContext);
          context = {
            "@context": {
              "xapi": "http://adlnet.gov/expapi/ontology/"
            }
          };
        }
      } catch (error) {
        console.error('Error loading JSON-LD context:', error);
      }
      
      // Add the context to the statement to create JSON-LD
      const jsonldData = {
        "@context": context["@context"],
        ...statement
      };
      
      // Convert to expanded JSON-LD (explicit URIs)
      const expandedData = await jsonld.expand(jsonldData);
      
      // Load into the triple store
      const result = await tripleStore.addStatement(statement);
      
      if (result.success) {
        console.log(`Successfully imported statement: ${statement.id}`);
      } else {
        console.error(`Failed to import statement: ${statement.id}`, result.error);
      }
      
      return result;
    } catch (error) {
      console.error('Error processing statement:', error);
      return { success: false, error: error.message };
    }
  }
}

// Main function to run the ETL pipeline
async function runPipeline() {
  console.log('Starting xAPI ETL pipeline...');
  
  const pipeline = new XapiEtlPipeline();
  
  try {
    // Initialize the triple store
    await tripleStore.initialize();
    
    // Run the ETL pipeline
    await pipeline.initialize();
    
    console.log('ETL pipeline completed successfully');
  } catch (error) {
    console.error('ETL pipeline error:', error);
  }
}

// Run the pipeline
if (require.main === module) {
  runPipeline();
}

module.exports = { XapiEtlPipeline, runPipeline };

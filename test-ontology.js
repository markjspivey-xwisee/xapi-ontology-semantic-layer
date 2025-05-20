const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const yaml = require('yaml');

// Define paths to files we want to test
const filesToTest = {
  jsonld: path.join(__dirname, 'rest-api', 'jsonld-context', 'statement-context.jsonld'),
  dataContract: path.join(__dirname, 'semantic-layer', 'data-contracts', 'xapi-data-contract-template.json'),
  dataProduct: path.join(__dirname, 'semantic-layer', 'data-products', 'xapi-data-product-spec.json'),
  openApi: path.join(__dirname, 'rest-api', 'openapi.yaml'),
  vkgSpec: path.join(__dirname, 'semantic-layer', 'vkg', 'xapi-virtual-kg-spec.yaml'),
};

// Function to validate JSON/JSON-LD files
async function validateJsonFile(filePath) {
  try {
    console.log(`\n👉 Validating ${path.basename(filePath)}`);
    const content = await readFile(filePath, 'utf8');
    const parsedContent = JSON.parse(content);
    console.log(`✅ ${path.basename(filePath)} is valid JSON`);
    
    // For JSON-LD, check for @context
    if (filePath.endsWith('.jsonld')) {
      if (parsedContent['@context']) {
        console.log(`✅ ${path.basename(filePath)} has a valid @context`);
      } else {
        console.log(`❌ ${path.basename(filePath)} is missing @context - not a valid JSON-LD file`);
      }
    }
    
    return { valid: true, parsed: parsedContent };
  } catch (error) {
    console.log(`❌ Error validating ${path.basename(filePath)}: ${error.message}`);
    return { valid: false, error };
  }
}

// Function to validate YAML files
async function validateYamlFile(filePath) {
  try {
    console.log(`\n👉 Validating ${path.basename(filePath)}`);
    const content = await readFile(filePath, 'utf8');
    const parsedContent = yaml.parse(content);
    console.log(`✅ ${path.basename(filePath)} is valid YAML`);
    return { valid: true, parsed: parsedContent };
  } catch (error) {
    console.log(`❌ Error validating ${path.basename(filePath)}: ${error.message}`);
    return { valid: false, error };
  }
}

// Function to analyze the structure of an ontology (simple validation)
function analyzeOntology(data) {
  console.log('\n📝 Analyzing ontology structure:');
  
  // For JSON-LD context
  if (data['@context']) {
    console.log(`Found ${Object.keys(data['@context']).length} vocabulary mappings`);
    
    // Count vocabularies
    const vocabs = new Set();
    Object.values(data['@context']).forEach(value => {
      if (typeof value === 'string' && value.includes('://')) {
        vocabs.add(value.split('/')[2]);
      }
    });
    
    console.log(`Referenced vocabularies: ${Array.from(vocabs).join(', ')}`);
  }
  
  // For data contracts/products
  if (data['dprod:dataModel'] || data['dataModel']) {
    console.log('✅ Data model specification found');
  }
  
  if (data['dprod:components'] || data['components']) {
    const components = data['dprod:components'] || data['components'];
    console.log(`✅ Found ${components.length} data product components`);
  }
}

// Function to analyze the structure of a virtual KG spec
function analyzeVKG(data) {
  console.log('\n📝 Analyzing Virtual Knowledge Graph specification:');
  
  // Check data sources
  if (data.dataSources) {
    console.log(`✅ Found ${data.dataSources.length} data sources`);
  }
  
  // Check virtual schema
  if (data.virtualSchema && data.virtualSchema.graphs) {
    console.log(`✅ Found ${data.virtualSchema.graphs.length} virtual graph(s)`);
    
    // Count mappings
    let totalMappings = 0;
    data.virtualSchema.graphs.forEach(graph => {
      if (graph.mappings) {
        totalMappings += graph.mappings.length;
      }
    });
    
    console.log(`✅ Found ${totalMappings} entity mappings`);
  }
  
  // Check semantic annotations
  if (data.semanticAnnotations) {
    console.log('✅ Semantic annotation configuration found');
  }
  
  // Check HATEOAS/affordances
  if (data.affordances) {
    console.log('✅ Distributed affordances configuration found');
  }
}

// Function to analyze the OpenAPI spec
function analyzeOpenAPI(data) {
  console.log('\n📝 Analyzing OpenAPI specification:');
  
  console.log(`API version: ${data.info.version}`);
  
  // Count paths
  const pathCount = Object.keys(data.paths).length;
  console.log(`✅ Found ${pathCount} API endpoints`);
  
  // Count schemas
  const schemaCount = Object.keys(data.components.schemas).length;
  console.log(`✅ Found ${schemaCount} data schemas`);
  
  // Check for hypermedia structures
  let hasHypermedia = false;
  Object.values(data.components.schemas).forEach(schema => {
    if (schema.properties && schema.properties._links) {
      hasHypermedia = true;
    }
  });
  
  if (hasHypermedia) {
    console.log('✅ HATEOAS hypermedia controls found');
  }
}

// Main function to run the tests
async function runTests() {
  console.log('🧪 Starting xAPI Ontology and Semantic Layer tests...');
  
  try {
    // Install yaml package if not already available
    try {
      require.resolve('yaml');
    } catch (e) {
      console.log('Installing yaml package...');
      require('child_process').execSync('npm install yaml', { stdio: 'inherit' });
      console.log('yaml package installed');
    }
    
    // Test JSON-LD context
    const jsonldResult = await validateJsonFile(filesToTest.jsonld);
    if (jsonldResult.valid) {
      analyzeOntology(jsonldResult.parsed);
    }
    
    // Test data contract
    const contractResult = await validateJsonFile(filesToTest.dataContract);
    if (contractResult.valid) {
      console.log(`✅ Data contract template validated`);
    }
    
    // Test data product
    const productResult = await validateJsonFile(filesToTest.dataProduct);
    if (productResult.valid) {
      analyzeOntology(productResult.parsed);
    }
    
    // Test OpenAPI spec
    const openApiResult = await validateYamlFile(filesToTest.openApi);
    if (openApiResult.valid) {
      analyzeOpenAPI(openApiResult.parsed);
    }
    
    // Test VKG spec
    const vkgResult = await validateYamlFile(filesToTest.vkgSpec);
    if (vkgResult.valid) {
      analyzeVKG(vkgResult.parsed);
    }
    
    console.log('\n✨ All tests completed!');
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Run the tests
runTests();

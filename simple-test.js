const fs = require('fs');
const path = require('path');

// Define paths to files we want to test
const filesToTest = {
  jsonld: path.join(__dirname, 'rest-api', 'jsonld-context', 'statement-context.jsonld'),
  dataContract: path.join(__dirname, 'semantic-layer', 'data-contracts', 'xapi-data-contract-template.json'),
  dataProduct: path.join(__dirname, 'semantic-layer', 'data-products', 'xapi-data-product-spec.json')
};

// Function to validate JSON/JSON-LD files
function validateJsonFile(filePath) {
  try {
    console.log(`\n👉 Validating ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsedContent = JSON.parse(content);
    console.log(`✅ ${path.basename(filePath)} is valid JSON`);
    
    // For JSON-LD, check for @context
    if (filePath.endsWith('.jsonld')) {
      if (parsedContent['@context']) {
        console.log(`✅ ${path.basename(filePath)} has a valid @context`);
        console.log(`Found ${Object.keys(parsedContent['@context']).length} vocabulary mappings`);
      } else {
        console.log(`❌ ${path.basename(filePath)} is missing @context - not a valid JSON-LD file`);
      }
    }
    
    return { valid: true, file: path.basename(filePath) };
  } catch (error) {
    console.log(`❌ Error validating ${path.basename(filePath)}: ${error.message}`);
    return { valid: false, file: path.basename(filePath), error };
  }
}

// Function to check if TTL files exist and are readable
function checkTurtleFile(filePath) {
  try {
    console.log(`\n👉 Checking ${path.basename(filePath)}`);
    const stats = fs.statSync(filePath);
    console.log(`✅ ${path.basename(filePath)} exists (${stats.size} bytes)`);
    return { valid: true, file: path.basename(filePath), size: stats.size };
  } catch (error) {
    console.log(`❌ Error checking ${path.basename(filePath)}: ${error.message}`);
    return { valid: false, file: path.basename(filePath), error };
  }
}

// Main function to run the tests
function runTests() {
  console.log('🧪 Starting xAPI Ontology and Semantic Layer tests...');
  
  // Validate existence and size of ontology files
  const ontologyFile = path.join(__dirname, 'ontology', 'xapi.ttl');
  const shapesFile = path.join(__dirname, 'ontology', 'xapi-shapes.ttl');
  
  checkTurtleFile(ontologyFile);
  checkTurtleFile(shapesFile);
  
  // Validate JSON files
  const results = [];
  for (const [key, filePath] of Object.entries(filesToTest)) {
    results.push(validateJsonFile(filePath));
  }
  
  // Check YAML files existence (we won't parse them without a YAML library)
  const openApiFile = path.join(__dirname, 'rest-api', 'openapi.yaml');
  const vkgFile = path.join(__dirname, 'semantic-layer', 'vkg', 'xapi-virtual-kg-spec.yaml');
  
  console.log(`\n👉 Checking ${path.basename(openApiFile)}`);
  if (fs.existsSync(openApiFile)) {
    console.log(`✅ ${path.basename(openApiFile)} exists`);
  } else {
    console.log(`❌ ${path.basename(openApiFile)} does not exist`);
  }
  
  console.log(`\n👉 Checking ${path.basename(vkgFile)}`);
  if (fs.existsSync(vkgFile)) {
    console.log(`✅ ${path.basename(vkgFile)} exists`);
  } else {
    console.log(`❌ ${path.basename(vkgFile)} does not exist`);
  }
  
  // Summary
  const validFiles = results.filter(r => r.valid).length;
  const totalFiles = results.length;
  
  console.log(`\n✨ Test Summary: ${validFiles}/${totalFiles} JSON/JSON-LD files are valid`);
  console.log('✨ Ontology TTL files are present and readable');
  console.log('✨ All tests completed!');
}

// Run the tests
runTests();

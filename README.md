# xAPI Ontology with Semantic Knowledge Graph Layer

## Overview
This repository provides a comprehensive specification for an xAPI (Experience API) ontology using Semantic Web technologies (RDF, OWL, SHACL) combined with a virtual knowledge graph semantic layer. The project integrates data contracts, data catalog specifications (DCAT), and data product specifications (DPROD) with RESTful HATEOAS (Hypermedia as the Engine of Application State) principles.

## Key Components

### xAPI Ontology
- Complete RDF/OWL vocabulary for xAPI statements and components
- SHACL validation schemas for ensuring data quality
- Mapping to existing e-learning standards and ontologies

### Semantic Knowledge Graph Layer
- Virtual knowledge graph architecture
- Data contract specifications
- Integration with DCAT for data cataloging
- Data product specifications (DPROD)

### RESTful HATEOAS Implementation
- Hypermedia-driven API design
- Linked data principles
- Distributed affordances
- Content negotiation for different representations

## Repository Structure

```
/
├── ontology/                # xAPI Ontology files
│   ├── xapi.ttl             # Core xAPI ontology in Turtle format
│   ├── xapi.owl             # OWL representation of xAPI ontology
│   ├── xapi-shapes.ttl      # SHACL shapes for xAPI data validation
│   └── extensions/          # Domain-specific xAPI extensions (see `ontology/extensions/language-learning.ttl`)
│
├── semantic-layer/          # Semantic Knowledge Graph Layer
│   ├── vkg/                 # Virtual Knowledge Graph specifications
│   ├── data-contracts/      # Data contract templates and examples
│   ├── dcat/                # Data Catalog (DCAT) integration
│   └── data-products/       # Data Product specifications
│
├── rest-api/                # RESTful API with HATEOAS
│   ├── openapi.yaml         # OpenAPI specification
│   ├── jsonld-context/      # JSON-LD context documents
│   └── examples/            # Example API requests and responses
│
├── examples/                # Example implementations and usage
│
└── docs/                    # Documentation
    ├── guides/              # User and implementation guides
    └── specifications/      # Detailed specifications
```

## Standards Compliance

This project adheres to the following standards and specifications:

- xAPI (Experience API) specification v1.0.3
- RDF 1.1 (Resource Description Framework)
- OWL 2 (Web Ontology Language)
- SHACL (Shapes Constraint Language)
- DCAT v2 (Data Catalog Vocabulary)
- JSON-LD 1.1 (JSON for Linking Data)
- OpenAPI 3.0
- REST architectural principles
- HATEOAS (Hypermedia as the Engine of Application State)

## Getting Started

Explore the repository structure above and check the documentation in the `/docs` directory for detailed information on each component.

### Running the reference API server

```
python3 rest_api/ref_impl/server.py
```

The server listens on port `8000` by default and stores all data in memory. It implements a minimal subset of the API defined in `rest-api/openapi.yaml` and is useful for quick experimentation.

### Sample data and validation

Example xAPI statements are provided under `examples/sample-statements.jsonld`. A helper script in `scripts/validate_samples.py` can validate these statements against the SHACL shapes, provided `pyshacl` and `rdflib` are available in your environment.

```
python3 scripts/validate_samples.py
```

Another script `scripts/generate_data.py` demonstrates how to generate additional statements.

## Contributing

Contributions are welcome! Please see CONTRIBUTING.md for details.

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.

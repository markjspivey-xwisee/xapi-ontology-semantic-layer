"""Validate example xAPI statements against SHACL shapes."""
import os
import sys

try:
    from pyshacl import validate
    from rdflib import Graph
except ImportError:
    print("pyshacl or rdflib not installed. Please install them to run validation.")
    sys.exit(0)

BASE = os.path.dirname(os.path.dirname(__file__))
statements_file = os.path.join(BASE, 'examples', 'sample-statements.jsonld')
shapes_file = os.path.join(BASE, 'ontology', 'xapi-shapes.ttl')

print(f'Validating {statements_file} against {shapes_file}...')

# Load data and shapes
data_graph = Graph().parse(statements_file, format='json-ld')
shapes_graph = Graph().parse(shapes_file, format='turtle')

conforms, report_graph, report_text = validate(
    data_graph,
    shacl_graph=shapes_graph,
    inference='rdfs',
    serialize_report_graph=True
)

print(report_text)
if conforms:
    print('Validation successful!')
else:
    print('Validation failed.')

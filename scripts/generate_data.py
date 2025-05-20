"""Generate example xAPI statements in JSON-LD format."""
import json
import uuid
from datetime import datetime
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent.parent / 'examples' / 'generated-statements.jsonld'

statements = [
    {
        "@context": "../rest-api/jsonld-context/statement-context.jsonld",
        "id": f"urn:uuid:{uuid.uuid4()}",
        "actor": {"mbox": "mailto:test@example.org", "name": "Test User"},
        "verb": {"id": "http://adlnet.gov/expapi/verbs/experienced", "display": {"en": "experienced"}},
        "object": {"id": "http://example.org/activity/demo"},
        "timestamp": datetime.utcnow().isoformat() + 'Z'
    }
]

OUTPUT.write_text(json.dumps(statements, indent=2))
print(f'Wrote example statements to {OUTPUT}')

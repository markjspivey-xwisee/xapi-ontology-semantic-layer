# Reference statement data path

The Node reference server retains original xAPI JSON and an expanded legacy RDF graph in the **same in-memory store used by the HTTP API**. It also creates a separate, source-qualified informational record for the current Foxxi/I2IDL-X consumer. It is not a durable or certified LRS, a deployed service, a full xAPI validator, an OWL consistency proof, or an assertion of learner achievement.

## Models and identity

- Original JSON is copied on ingestion and returned without flattening, with its UUID, event/stored timestamps, protocol version, extensions and unknown fields preserved. A missing UUID is assigned before storage. Keys are compared by canonical JSON; this digest is not a hash of HTTP whitespace or raw request bytes.
- The legacy graph root is urn:uuid:<lowercase UUID>, typed http://adlnet.gov/expapi/ontology/Statement. Its source model is pinned to repository commit c654b5c336738cfec672f485c1b454787abcefa2, ontology/xapi.ttl, versionInfo 1.0.0. No upstream namespace or ontology axiom is changed.
- A distinct urn:xapi-semantic-layer:record:<UUID> is typed https://foxxi-bridge.interego.xwisee.com/ns/xapi#Statement and prov:Entity. The target ontology release is 2026.10.1, independent of the original JSON's xAPI protocol version.
- A separate prov:Entity retains the canonical original JSON as an rdf:JSON literal and its SHA-256. The informational record is prov:wasDerivedFrom this source document and schema:about the legacy root. It is not derived directly from a PROV activity.
- Only this structural JSON adapter creates current record typing. Bare RDF/class labels, foreign JSON-LD contexts and incomplete actor/verb/object structures are refused. There is no namespace-wide equivalence, reverse mapping, sameAs, automatic I2IDL classification, credential validation or achievement inference.
- UUIDs are immutable within one process. A retry of the same UUID and identical JSON is idempotent; a changed original receives HTTP 409. Concurrent submissions obey the same rule. Restarting loses these in-memory records.

The adapter uses only the checked-in context at rest-api/jsonld-context/statement-context.jsonld. Its canonical-JSON SHA-256 is 59f549bd2d6ea9bfead0b23ab6a12ee9106fcf57bb4e3d96870b171151a39c9c; changed context data is refused. The supported relative context alias in the repository sample is accepted locally. Arbitrary remote contexts are never loaded. SHACL shapes are loaded as data; loading them does not execute validation or rules.

Extension values remain opaque JSON (including JSON-LD-looking keys) and are retained as rdf:JSON literals; their contents do not inject RDF contexts or classification claims. StatementRef objects are separate reference nodes, rather than additional types asserted on the referenced statement itself.

## Run and consume

Run npm ci --ignore-scripts then npm start from implementation/. The API binds to loopback port 3000; its UI remains on port 3001. Startup ETL and API share one store instead of importing samples into a different process. Standalone npm run start:api starts an empty store.

| HTTP operation | Result |
|---|---|
| POST /statements | Structural JSON ingestion: 201 new, 200 identical retry, 400 invalid, 409 changed UUID |
| GET /statements/{UUID} | Retained original JSON |
| GET /statements | Actual RDF query results, with actor/verb/activity/time filters |
| GET /statements/{UUID}/legacy | Actual stored legacy RDF |
| GET /statements/{UUID}/record | Actual stored current informational-record RDF and source-document provenance |
| GET /statements/{UUID}/provenance | Exact identities, source/context digests, model pin, protocol version and storage scope |
| GET /sparql?query=... | Local SELECT or ASK; updates and federated SERVICE refused |
| GET /contexts/statement-context | Verified local context |

RDF endpoints negotiate application/ld+json or text/turtle. Both serialize the actual stored graph; Turtle uses the valid N-Triples subset and the locked N3 writer to escape literals correctly. Original and record named graphs remain distinct. The query dataset exposes their union plus legacy ontology/shapes; this does not equate classes or run an OWL reasoner.

Submit the emitted **record** graph to the current I2IDL-X classifier to verify that external consumer boundary. Its exact current Foxxi root should classify as xapi-statement and learning-record; the original ADL root, source-document entity and actor/account parts must not acquire that typing merely from a shared label. A local HTTP pass does not establish external deployment or historical migration.

## Regression checks

npm test starts the real application on an ephemeral loopback port with a synthetic software-agent fixture. It exercises ETL, actual HTTP POST/read/query, legacy consumers, actual-store RDF export/format parity, provenance, immutable/duplicate IDs, invalid/foreign input refusal, denied remote query/context fallback and failed-commit rollback. It does not submit learner activity or contact an LRS.

Set ALIGNMENT_EVIDENCE_DIR to retain actual HTTP-emitted synthetic record/legacy graphs and proof for an independent classifier call. No external classifier or model call is hidden inside this test. The Python API remains a separate in-memory implementation, with its own explicit [JSON-to-record read projection](../rest_api/ref_impl/README.md). It does not share this Node store or claim the Node adapter's legacy RDF source model. The same npm test command also tests the real Python HTTP path; PYTHON may select its interpreter and PYTHON_ALIGNMENT_EVIDENCE_DIR retains that path's separate evidence.

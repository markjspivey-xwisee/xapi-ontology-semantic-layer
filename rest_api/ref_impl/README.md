# xAPI Reference Server

This directory contains a minimal reference implementation of the REST API
described by `../openapi.yaml`. The server is intentionally lightweight and
relies only on Python's standard library so it can run in restricted
environments without installing additional dependencies.

## Running the server

```bash
python3 server.py
```

By default the server listens on port 8000. It maintains all data in memory so
any stored items will be lost when the process stops.

## Implemented endpoints

* `GET /` – API root with hypermedia links
* `GET /statements` – list stored statements
* `POST /statements` – store a new statement (UUID generated if missing)
* `GET /statements/{id}` – retrieve a single statement
* Similar endpoints exist for `activities`, `agents`, and `verbs`.

This implementation only covers a tiny subset of the full specification but
serves as a starting point for experimentation and testing.

## Explicit current-record export

`GET /statements/{id}/record` projects the retained JSON on read as `text/turtle`
(default) or context-free `application/ld+json`. `GET /statements/{id}/provenance`
returns its exact identities, normalized source JSON and SHA-256, known protocol
version, target model release, projection version and in-memory storage scope.
The API root advertises both read ports. Query parameters cannot override their
identity, model or context; unsupported record media types receive HTTP 406.

The distinct `urn:xapi-python-reference:record:{lowercase UUID}` is an
informational `prov:Entity` typed with the exact current Foxxi
`https://foxxi-bridge.interego.xwisee.com/ns/xapi#Statement`. Target ontology release
`2026.10.1` is separate from the original JSON's protocol `version`. If absent,
the source protocol version is unknown, not inferred from the API's version.
This JSON-only server had no legacy RDF root or producer ontology: neither an
Activity nor an ADL/HD source model is manufactured. The reader's pinned repository
baseline identifies the implementation being adapted, not the event's producer.

The record is `prov:wasDerivedFrom` a separate source-JSON `prov:Entity`, identified
by the UTF-8 normalized JSON SHA-256. Its `rdf:JSON` literal preserves the whole
retained object, including opaque extensions, unknown fields, timestamps and
JSON-LD-looking keys. No caller context is expanded or fetched. Normalization
uses Python sorted keys, compact separators and unescaped Unicode; this is not a
hash of HTTP whitespace, original transport bytes or a claim of RFC 8785
canonicalization. Both RDF formats serialize the same projection of that source.

Export requires a UUID, an identifiable Agent/Group, a Verb IRI and a supported
Activity/Agent/Group/StatementRef Object. Agents and identified Groups need exactly
one identifier; mailboxes require a `mailto:` address containing `@`. Anonymous
Groups need valid Agent members; malformed or nested Group members are refused.
Export is bounded to 262144 UTF-8 source bytes and finite UTF-8 JSON;
SubStatements are outside this small projection. These structural checks are
**not full xAPI protocol validation, SHACL validation or certification**. A loose
or unsupported stored row still returns unchanged JSON at its original read
port; only its record/provenance export receives HTTP 422. No classifier, model,
external LRS, achievement inference or ontology-equivalence rule runs here.

Original IDs are immutable in this process: first write is HTTP 201, an identical
JSON retry is HTTP 200 without another row, and changed JSON under the same UUID
is HTTP 409. Missing IDs are still generated before storage. Stopping the process
loses all rows; this change adds neither persistence nor authentication.

The alternate `rest-api/ref_impl/server.py` launch delegates to this implementation.
The Node reference API remains a separate store and adapter. From `implementation/`,
run `npm ci --ignore-scripts` and `npm test` with Python 3.12 available (`PYTHON`
may select the interpreter). The regression launches this actual HTTP server on an
ephemeral loopback port, forbids outbound Python sockets and JSON-LD context
loading, parses both RDF forms with independent consumers, and checks original
readback, opaque escaping, invalid export refusal and idempotent/conflicting IDs.
`PYTHON_ALIGNMENT_EVIDENCE_DIR` retains its synthetic HTTP-emitted graph for an
independent current I2IDL-X classifier call; running these tests makes no such
external call and writes no learner record.

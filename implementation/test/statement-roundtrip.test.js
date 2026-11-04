const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const N3 = require('n3');
const jsonld = require('jsonld');
const { startApplication } = require('../app');
const { XapiTripleStore } = require('../triple-store/store');
const { loadPinnedContext, canonicalJson, sha256, FOXXI, LEGACY, CONTEXT_SHA256 } = require('../statement-projection');

const statement = {
  id: '11111111-1111-4111-8111-111111111111',
  actor: { objectType: 'Agent', account: { homePage: 'https://example.org/software', name: 'fixture-agent' } },
  verb: { id: 'https://example.org/verbs/inspected', display: { en: 'inspected' } },
  object: { id: 'https://example.org/fixture', definition: { name: { en: 'Synthetic adapter fixture' } } },
  timestamp: '2026-11-04T18:00:00Z', stored: '2026-11-04T18:01:00Z', version: '1.0.3',
  context: { extensions: { 'https://example.org/opaque': {
    keep: ['original', 42], nested: { yes: true }, '@context': 'https://example.org/must-not-load'
  } } }
};
const store = new XapiTripleStore();
let app, base, temporary;
let externalAttempts = 0;
const restore = [];
function restrictNetwork() {
  for (const module of [http, https]) for (const name of ['request', 'get']) {
    const original = module[name];
    module[name] = function (first, ...rest) {
      const host = typeof first === 'string' || first instanceof URL ? new URL(first).hostname : first.hostname || first.host || 'localhost';
      if (!['127.0.0.1', 'localhost', '::1'].includes(host)) { externalAttempts++; throw new Error('TEST_NETWORK_FORBIDDEN'); }
      return original.call(this, first, ...rest);
    };
    restore.push(() => { module[name] = original; });
  }
  const original = global.fetch;
  global.fetch = (input, init) => {
    if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(String(input)).hostname)) { externalAttempts++; throw new Error('TEST_NETWORK_FORBIDDEN'); }
    return original(input, init);
  };
  restore.push(() => { global.fetch = original; });
}
async function post(body) {
  return fetch(base + '/statements', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function query(sparql) {
  const response = await fetch(base + '/sparql?query=' + encodeURIComponent(sparql));
  assert.equal(response.status, 200);
  return (await response.json()).results;
}
before(async () => {
  restrictNetwork();
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-layer-e2e-'));
  fs.writeFileSync(path.join(temporary, 'fixture.json'), JSON.stringify(statement));
  app = await startApplication({ store, sampleDataDir: temporary, apiPort: 0, ui: false });
  base = 'http://127.0.0.1:' + app.apiServer.address().port;
});
after(async () => {
  if (app) await app.close();
  restore.reverse().forEach(fn => fn());
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
});

test('actual application ETL and HTTP use the same store and preserve the full original', async () => {
  const response = await fetch(base + '/statements/' + statement.id);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), statement);
  const listing = await (await fetch(base + '/statements')).json();
  assert.equal(listing.count, 1);
  assert.equal(listing.statements[0].statement.value, 'urn:uuid:' + statement.id);
  assert.equal(listing.statements[0]._links.self.href, '/statements/' + statement.id);
  assert.equal((await query('SELECT ?s WHERE { ?s a <' + LEGACY + 'Statement> }')).length, 1);
});

test('real HTTP ingestion is visible to query, original readback and legacy consumers', async () => {
  const second = { ...statement, id: '22222222-2222-4222-8222-222222222222', actor: { mbox: 'mailto:fixture@example.org' } };
  const response = await post(second);
  assert.equal(response.status, 201);
  const receipt = await response.json();
  assert.equal(receipt.recordIri, 'urn:xapi-semantic-layer:record:' + second.id);
  assert.deepEqual(await (await fetch(base + response.headers.get('location'))).json(), second);
  const filtered = await (await fetch(base + '/statements?actor=' + encodeURIComponent(second.actor.mbox))).json();
  assert.equal(filtered.count, 1);
  assert.equal(filtered.statements[0].statement.value, 'urn:uuid:' + second.id);
  for (const endpoint of ['/verbs', '/activities', '/agents']) {
    const r = await fetch(base + endpoint);
    assert.equal(r.status, 200, endpoint);
    assert.ok((await r.json()).count >= 1, endpoint);
  }
  assert.equal((await (await fetch(base + '/statements?verb=' + encodeURIComponent('https://example.org/not-the-verb'))).json()).count, 0);
});

test('record is distinct, source-qualified and has no blanket equivalence or achievement facts', async () => {
  const rows = await query('SELECT ?s WHERE { ?s a <' + FOXXI + 'Statement> }');
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.s.value.startsWith('urn:xapi-semantic-layer:record:')));
  assert.equal((await query('SELECT ?s WHERE { ?s a <' + LEGACY + 'Statement>; a <' + FOXXI + 'Statement> }')).length, 0);
  const record = await (await fetch(base + '/statements/' + statement.id + '/record', { headers: { accept: 'text/turtle' } })).text();
  const quads = new N3.Parser().parse(record);
  const types = quads.filter(q => q.predicate.value.endsWith('#type'));
  assert.ok(types.some(q => q.subject.value === 'urn:xapi-semantic-layer:record:' + statement.id && q.object.value === FOXXI + 'Statement'));
  assert.ok(!quads.some(q => /isClassifiedBy|sameAs|equivalentClass|achievement|mastery/.test(q.predicate.value)));
  const derived = quads.find(q => q.predicate.value === 'http://www.w3.org/ns/prov#wasDerivedFrom');
  assert.ok(derived.object.value.startsWith('urn:xapi-semantic-layer:source-json:sha256:'));
  assert.equal(quads.find(q => q.subject.equals(derived.object) && q.predicate.value.endsWith('#value')).object.value, canonicalJson(statement));
  const provenance = await (await fetch(base + '/statements/' + statement.id + '/provenance')).json();
  assert.equal(provenance.sourceJsonCanonicalSha256, sha256(canonicalJson(statement)));
  assert.equal(provenance.sourceProtocolVersion, '1.0.3');
  assert.equal(provenance.contextCanonicalSha256, CONTEXT_SHA256);
  assert.ok(provenance.sourceModel.includes('/c654b5c336738cfec672f485c1b454787abcefa2/'));
  assert.ok(provenance.targetOntologyVersion.endsWith('/2026.10.1'));
  assert.equal(provenance.storage, 'in-memory');
});

test('HTTP Turtle and JSON-LD export the same actual stored graph; retain classifier fixture', async () => {
  const output = {};
  for (const kind of ['record', 'legacy']) {
    const url = base + '/statements/' + statement.id + '/' + kind;
    const turtle = await (await fetch(url, { headers: { accept: 'text/turtle' } })).text();
    const expanded = await (await fetch(url, { headers: { accept: 'application/ld+json' } })).json();
    const fromTurtle = await jsonld.canonize(await jsonld.fromRDF(turtle, { format: 'application/n-quads' }), { algorithm: 'URDNA2015', format: 'application/n-quads' });
    const fromJsonld = await jsonld.canonize(expanded, { algorithm: 'URDNA2015', format: 'application/n-quads' });
    assert.equal(fromJsonld, fromTurtle);
    output[kind] = { turtle, expanded, graphSha256: sha256(fromTurtle) };
  }
  assert.equal((await query('SELECT ?s WHERE { GRAPH <urn:xapi-semantic-layer:graph:' + statement.id + ':record> { ?s a <' + FOXXI + 'Statement> } }')).length, 1);
  if (process.env.ALIGNMENT_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.ALIGNMENT_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.ALIGNMENT_EVIDENCE_DIR, 'actual-http-record.ttl'), output.record.turtle);
    fs.writeFileSync(path.join(process.env.ALIGNMENT_EVIDENCE_DIR, 'actual-http-legacy.ttl'), output.legacy.turtle);
    fs.writeFileSync(path.join(process.env.ALIGNMENT_EVIDENCE_DIR, 'actual-http-original.json'), JSON.stringify(statement, null, 2) + '\n');
    fs.writeFileSync(path.join(process.env.ALIGNMENT_EVIDENCE_DIR, 'actual-http-export-proof.json'), JSON.stringify({
      syntheticFixture: true, storage: 'in-memory', sourceCommit: 'c654b5c336738cfec672f485c1b454787abcefa2',
      recordGraphSha256: output.record.graphSha256, legacyGraphSha256: output.legacy.graphSha256,
      recordIri: 'urn:xapi-semantic-layer:record:' + statement.id, originalPreserved: true,
      formatIsomorphism: true, liveClassifier: 'Parent must submit actual-http-record.ttl; not claimed by this test'
    }, null, 2) + '\n');
  }
});

test('same UUID retry is idempotent; different payload conflicts and cannot overwrite', async () => {
  const reordered = Object.fromEntries(Object.entries(statement).reverse());
  const response = await post(reordered);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).duplicate, true);
  const results = await Promise.all([post(statement), post({ ...statement, timestamp: '2026-11-04T19:00:00Z' })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.deepEqual(await (await fetch(base + '/statements/' + statement.id)).json(), statement);
  assert.equal((await query('SELECT ?s WHERE { ?s a <' + FOXXI + 'Statement> }')).length, 2);
});

test('refuse bare RDF/class labels, bad identity, foreign contexts and missing required structure', async () => {
  const invalid = [
    { '@id': 'urn:foreign:account', '@type': 'https://w3id.org/xapi/ontology#Statement' },
    { ...statement, id: 'not-a-uuid' },
    { ...statement, id: '33333333-3333-4333-8333-333333333333', '@context': 'https://example.org/remote-context' },
    { ...statement, id: '33333333-3333-4333-8333-333333333333', actor: { name: 'No IFI' } },
    ...[null, false, 'not-an-agent', { objectType: 'Group' }].map(member => ({
      ...statement, id: '33333333-3333-4333-8333-333333333333', actor: { objectType: 'Group', member: [member] }
    })),
    { ...statement, id: '33333333-3333-4333-8333-333333333333', object: { objectType: 'Unknown', id: 'https://example.org/x' } },
    { id: '33333333-3333-4333-8333-333333333333', actor: statement.actor }
  ];
  for (const body of invalid) assert.equal((await post(body)).status, 400);
  assert.equal((await fetch(base + '/statements/33333333-3333-4333-8333-333333333333')).status, 404);
  assert.equal((await fetch(base + '/statements/not-a-uuid')).status, 400);
  assert.equal((await fetch(base + '/statements?since=not-a-time')).status, 400);
  assert.equal((await fetch(base + '/statements/' + statement.id + '/record', { headers: { accept: 'text/html' } })).status, 406);
});

test('query refuses updates and remote SERVICE; no context or query network fallback occurred', async () => {
  for (const query of ['CLEAR ALL', 'SELECT * WHERE { SERVICE <https://example.org/sparql> { ?s ?p ?o } }']) {
    const response = await fetch(base + '/sparql?query=' + encodeURIComponent(query));
    assert.equal(response.status, 400);
  }
  assert.equal(externalAttempts, 0);
  assert.equal((await (await fetch(base + '/contexts/statement-context')).json())['@context'].xapi, LEGACY);
  assert.equal((await fetch(base + '/contexts/unknown')).status, 404);
});

test('pinned context tampering refuses; failed second graph commit leaves no partial record', async () => {
  const wrongContext = path.join(temporary, 'changed-context.jsonld');
  fs.writeFileSync(wrongContext, JSON.stringify({ '@context': { xapi: 'https://example.org/changed#' } }));
  assert.throws(() => loadPinnedContext(wrongContext), /digest mismatch/);
  const failing = new XapiTripleStore();
  const importer = failing.importJsonldData.bind(failing);
  let calls = 0;
  failing.importJsonldData = (...args) => ++calls === 2 ? Promise.reject(new Error('injected import failure')) : importer(...args);
  assert.equal((await failing.addStatement(statement)).success, false);
  assert.equal(failing.getOriginal(statement.id), undefined);
  for (const suffix of ['legacy', 'record']) {
    const actualGraph = await new Promise((resolve, reject) => failing.store.graph(
      'urn:xapi-semantic-layer:graph:' + statement.id + ':' + suffix,
      (error, graph) => error ? reject(error) : resolve(graph)));
    assert.equal(actualGraph.toArray().length, 0);
  }
  assert.equal((await failing.executeQuery('SELECT ?s WHERE { ?s a <' + LEGACY + 'Statement> }')).length, 0);
  assert.equal((await failing.executeQuery('SELECT ?s WHERE { GRAPH <urn:xapi-semantic-layer:graph:' + statement.id + ':legacy> { ?s ?p ?o } }')).length, 0);
  failing.importJsonldData = importer;
  assert.equal((await failing.addStatement(statement)).success, true);
});

test('server-assigned UUID and StatementRef preserve record-versus-reference identity', async () => {
  const body = { ...statement, object: { objectType: 'StatementRef', id: statement.id } };
  delete body.id;
  const response = await post(body);
  assert.equal(response.status, 201);
  const receipt = await response.json();
  assert.match(receipt.id, /^[0-9a-f-]{36}$/);
  assert.equal(body.id, undefined);
  assert.deepEqual(await (await fetch(base + '/statements/' + receipt.id)).json(), { ...body, id: receipt.id });
  const legacy = await (await fetch(base + '/statements/' + receipt.id + '/legacy', { headers: { accept: 'text/turtle' } })).text();
  const quads = new N3.Parser().parse(legacy);
  assert.ok(!quads.some(q => q.subject.value === 'urn:uuid:' + statement.id && q.object.value === LEGACY + 'StatementRef'));
  assert.ok(quads.some(q => q.subject.termType === 'BlankNode' && q.object.value === LEGACY + 'StatementRef'));
});

test('failed startup ETL refuses before the HTTP API can serve a partial import', async () => {
  const sampleDataDir = path.join(temporary, 'invalid-startup');
  fs.mkdirSync(sampleDataDir);
  fs.writeFileSync(path.join(sampleDataDir, 'invalid.json'), JSON.stringify({ ...statement, actor: { name: 'Missing IFI' } }));
  await assert.rejects(startApplication({ store: new XapiTripleStore(), sampleDataDir, apiPort: 0, ui: false }), /identifier/);
});

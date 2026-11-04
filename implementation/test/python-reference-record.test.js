const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const N3 = require('n3');
const jsonld = require('jsonld');

const FOXXI = 'https://foxxi-bridge.interego.xwisee.com/ns/xapi#';
const PROV = 'http://www.w3.org/ns/prov#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const fixture = {
  id: 'a3333333-3333-4333-8333-333333333333',
  actor: { account: { homePage: 'https://example.org/software', name: 'python-fixture' } },
  verb: { id: 'https://example.org/verbs/inspected' },
  object: { id: 'https://example.org/python-fixture' },
  timestamp: '2026-11-04T18:00:00Z', stored: '2026-11-04T18:01:00Z', version: '1.0.3',
  context: { extensions: { 'https://example.org/opaque': {
    '@context': 'https://example.org/must-not-load',
    quote: '"quotes"\nnewline\tand\\slash; café 雪 😀', keep: [false, null, 42, { '@type': 'ClaimedAchievement' }],
  } } },
};
const digest = value => createHash('sha256').update(value).digest('hex');
let child, base, stderr = '';
const repo = path.resolve(__dirname, '../..');
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
async function post(value) {
  return fetch(base + '/statements', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
}
async function get(suffix, accept) {
  return fetch(base + '/statements/' + fixture.id + suffix, { headers: accept ? { accept } : {} });
}
before(async () => {
  // The real Python handler runs on an ephemeral port. Any outbound socket is forbidden.
  const program = `import socket,json,runpy\nfrom http.server import HTTPServer\nfrom rest_api.ref_impl.server import SimpleXAPIServer\noriginal=socket.socket.connect\ndef denied(*args,**kwargs): raise RuntimeError('TEST_NETWORK_FORBIDDEN')\nsocket.socket.connect=denied\nassert runpy.run_path('rest-api/ref_impl/server.py')['SimpleXAPIServer'] is SimpleXAPIServer\nhttpd=HTTPServer(('127.0.0.1',0),SimpleXAPIServer)\nprint(json.dumps({'port':httpd.server_port}),flush=True)\nhttpd.serve_forever()\n`;
  child = spawn(python, ['-u', '-c', program], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', chunk => { stderr += chunk; });
  base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Python startup timeout: ' + stderr)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Python exited ' + code + ': ' + stderr)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('\n')) {
        clearTimeout(timer);
        try { resolve('http://127.0.0.1:' + JSON.parse(output.split('\n')[0]).port); } catch (error) { reject(error); }
      }
    });
  });
  assert.equal((await post(fixture)).status, 201);
});
after(async () => {
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
});

test('Python root advertises reads and retains the entire original independently', async () => {
  const root = await (await fetch(base + '/')).json();
  assert.equal(root._links.record.href, '/statements/{id}/record');
  assert.equal(root._links.provenance.templated, true);
  assert.deepEqual(await (await get('')).json(), fixture);
  assert.equal((await get('/record', 'application/json')).status, 406);
  assert.equal((await get('/record?recordIri=https://example.org/override')).status, 400);
  assert.equal((await get('/record/extra')).status, 404);
});

test('actual Python HTTP Turtle and context-free JSON-LD agree and preserve escaped opaque JSON', async () => {
  const response = await get('/record', 'text/turtle');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/turtle/);
  const turtle = await response.text();
  const quads = new N3.Parser().parse(turtle);
  const jsonResponse = await get('/record', 'application/ld+json');
  assert.equal(jsonResponse.status, 200);
  const expanded = await jsonResponse.json();
  assert.ok(!('@context' in expanded));
  const refuseRemote = async () => { throw new Error('TEST_REMOTE_CONTEXT_FORBIDDEN'); };
  const options = { algorithm: 'URDNA2015', format: 'application/n-quads', documentLoader: refuseRemote };
  const normalized = await jsonld.canonize(await jsonld.fromRDF(turtle, { format: 'application/n-quads' }), options);
  assert.equal(await jsonld.canonize(expanded, options), normalized);
  const record = 'urn:xapi-python-reference:record:' + fixture.id;
  const types = quads.filter(q => q.predicate.value === RDF + 'type');
  assert.deepEqual(types.filter(q => q.object.value === FOXXI + 'Statement').map(q => q.subject.value), [record]);
  const source = quads.find(q => q.predicate.value === PROV + 'wasDerivedFrom').object.value;
  assert.notEqual(source, record);
  assert.ok(types.some(q => q.subject.value === source && q.object.value === PROV + 'Entity'));
  const retained = quads.find(q => q.subject.value === source && q.predicate.value === RDF + 'value');
  assert.equal(retained.object.datatype.value, RDF + 'JSON');
  assert.deepEqual(JSON.parse(retained.object.value), fixture);
  assert.equal(source, 'urn:xapi-python-reference:source-json:sha256:' + digest(retained.object.value));
  assert.ok(!quads.some(q => /sameAs|equivalentClass|isClassifiedBy|achievement|mastery/.test(q.predicate.value)));
  assert.ok(!quads.some(q => q.predicate.value === 'http://purl.org/dc/terms/conformsTo'));
  assert.ok(quads.some(q => q.predicate.value === 'http://purl.org/dc/terms/references' && q.object.value === FOXXI.slice(0, -1) + '/2026.10.1'));
  assert.ok(!quads.some(q => q.object.value === PROV + 'Activity' || q.predicate.value === 'https://schema.org/about'));
  const provenance = await (await get('/provenance')).json();
  assert.deepEqual(provenance.originalJson, fixture);
  assert.equal(provenance.canonicalSourceJson, retained.object.value);
  assert.equal(provenance.sourceJsonCanonicalSha256, digest(retained.object.value));
  assert.equal(provenance.sourceOntology, null);
  assert.equal(provenance.legacyActivity, null);
  assert.equal(provenance.sourceProtocolVersion, '1.0.3');
  assert.equal(provenance.targetOntologyVersion, '2026.10.1');
  assert.equal(provenance.storage, 'in-memory');
  if (process.env.PYTHON_ALIGNMENT_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.PYTHON_ALIGNMENT_EVIDENCE_DIR, { recursive: true });
    for (const [name, value] of Object.entries({ 'record.ttl': turtle, 'record.jsonld': JSON.stringify(expanded, null, 2), 'original.json': JSON.stringify(fixture, null, 2), 'provenance.json': JSON.stringify(provenance, null, 2) })) fs.writeFileSync(path.join(process.env.PYTHON_ALIGNMENT_EVIDENCE_DIR, name), value);
    fs.writeFileSync(path.join(process.env.PYTHON_ALIGNMENT_EVIDENCE_DIR, 'http-proof.json'), JSON.stringify({ base: 'ephemeral-loopback', source: 'actual Python HTTP record response', tripleCount: quads.length, turtleSha256: digest(turtle), normalizedGraphSha256: digest(normalized), sourceJsonSha256: provenance.sourceJsonCanonicalSha256, remoteContexts: 'forbidden', outboundPythonSockets: 'forbidden', originalPreserved: true }, null, 2));
  }
});

test('same UUID retry is idempotent, changed JSON conflicts and the first original is unchanged', async () => {
  const retry = await post(JSON.parse(JSON.stringify(fixture)));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal((await post({ ...fixture, stored: 'changed' })).status, 409);
  const upper = { ...fixture, id: fixture.id.toUpperCase(), object: { id: 'https://example.org/changed' } };
  assert.equal((await post(upper)).status, 409);
  assert.deepEqual(await (await get('')).json(), fixture);
  const rows = await (await fetch(base + '/statements')).json();
  assert.equal(rows.filter(row => row.id === fixture.id).length, 1);
});

test('legacy loose JSON remains writable/readable but malformed structures cannot export', async () => {
  const malformed = [
    { actor: { name: 'historical' }, verb: 'did', object: 'test' },
    ...[null, false, 'Agent', [], { objectType: 'Group', member: null }, { objectType: 'Group', member: {} },
      { objectType: 'Group', member: [null] }, { objectType: 'Group', member: [false] },
      { objectType: 'Group', member: ['Agent'] }, { objectType: 'Group', member: [{ objectType: 'Group', member: [] }] },
      { mbox: 'https://example.org/not-mailbox' }, { mbox: 'mailto:x' },
      { mbox: 'mailto:software@example.org', openid: 'https://example.org/software' },
      { mbox: 'mailto:software@example.org', member: [] },
      { objectType: 'Group', mbox: 'mailto:x', member: [{ mbox: 'mailto:software@example.org' }] },
      { objectType: 'Group', mbox: 'mailto:software@example.org', account: { homePage: 'https://example.org', name: 'two' } }].map(actor => ({ ...fixture, actor })),
    { ...fixture, verb: null }, { ...fixture, object: false },
    { ...fixture, object: { objectType: 'StatementRef', id: 'not-a-uuid' } },
    { ...fixture, version: null }, { ...fixture, '@type': FOXXI + 'Statement', actor: {} },
  ];
  let index = 0;
  for (const value of malformed) {
    const statement = { ...value, id: `44444444-4444-4444-8444-${String(index++).padStart(12, '0')}` };
    assert.equal((await post(statement)).status, 201);
    const url = base + '/statements/' + statement.id;
    assert.deepEqual(await (await fetch(url)).json(), statement);
    const refused = await fetch(url + '/record');
    assert.equal(refused.status, 422, JSON.stringify(statement.actor));
    assert.equal((await refused.json()).originalPreserved, true);
  }
  const loose = { actor: { name: 'old example' }, verb: 'did', object: 'test' };
  const created = await post(loose);
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.deepEqual(await (await fetch(base + '/statements/' + id)).json(), { ...loose, id });
  assert.equal((await fetch(base + '/statements/' + id + '/record')).status, 422);
});

test('eligible groups, unknown protocol and non-UUID legacy IDs are distinguished', async () => {
  const anonymous = { ...fixture, id: '55555555-5555-4555-8555-555555555555', actor: { objectType: 'Group', member: [{ mbox: 'mailto:software@example.org' }] } };
  delete anonymous.version;
  assert.equal((await post(anonymous)).status, 201);
  const prov = await (await fetch(base + '/statements/' + anonymous.id + '/provenance')).json();
  assert.equal(prov.sourceProtocolVersion, null);
  assert.equal(prov.sourceOntology, null);
  const identified = { ...fixture, id: '77777777-7777-4777-8777-777777777777', actor: { objectType: 'Group', account: { homePage: 'https://example.org/software', name: 'group-fixture' }, member: [{ mbox: 'mailto:software@example.org' }] } };
  assert.equal((await post(identified)).status, 201);
  assert.equal((await fetch(base + '/statements/' + identified.id + '/record')).status, 200);
  const nonUuid = { ...fixture, id: 'historical-id' };
  assert.equal((await post(nonUuid)).status, 201);
  assert.deepEqual(await (await fetch(base + '/statements/historical-id')).json(), nonUuid);
  assert.equal((await fetch(base + '/statements/historical-id/record')).status, 422);
  assert.equal((await post({ ...fixture, id: '66666666-6666-4666-8666-666666666666', extra: 'x'.repeat(262145) })).status, 201);
  assert.equal((await fetch(base + '/statements/66666666-6666-4666-8666-666666666666/record')).status, 422);
});

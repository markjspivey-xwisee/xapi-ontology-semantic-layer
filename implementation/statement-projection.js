const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const jsonld = require('jsonld');

const LEGACY = 'http://adlnet.gov/expapi/ontology/';
const FOXXI = 'https://foxxi-bridge.interego.xwisee.com/ns/xapi#';
const PROV = 'http://www.w3.org/ns/prov#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SOURCE = 'https://github.com/markjspivey-xwisee/xapi-ontology-semantic-layer/blob/c654b5c336738cfec672f485c1b454787abcefa2/ontology/xapi.ttl';
// Canonical-JSON digest is independent of checkout line endings. No remote contexts.
const CONTEXT_SHA256 = '59f549bd2d6ea9bfead0b23ab6a12ee9106fcf57bb4e3d96870b171151a39c9c';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTEXT_PATH = path.join(__dirname, '..', 'rest-api', 'jsonld-context', 'statement-context.jsonld');
const ADAPTER = 'urn:xapi-semantic-layer:adapter:informational-record:v1';

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function bad(message, code = 'invalid_statement') {
  const error = new Error(message); error.code = code; return error;
}
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function iri(value) { return typeof value === 'string' && /^[a-z][a-z0-9+.-]*:[^\s<>"{}|^\\\x00-\x20]+$/i.test(value); }
function loadPinnedContext(contextPath = CONTEXT_PATH) {
  const document = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  if (sha256(canonicalJson(document)) !== CONTEXT_SHA256) throw bad('Pinned local context digest mismatch', 'context_mismatch');
  return document['@context'];
}
async function denyRemoteContext(url) { throw bad('Remote JSON-LD context refused: ' + url, 'remote_context_refused'); }
const JSONLD_OPTIONS = { documentLoader: denyRemoteContext };

function checkKeywords(value, root = true) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(item => checkKeywords(item, false)); return; }
  for (const [key, item] of Object.entries(value)) {
    // xAPI extension values are arbitrary JSON, not client-supplied RDF contexts.
    if (key === 'extensions') continue;
    if (key.startsWith('@')) {
      const knownContext = root && key === '@context' && (item === '../rest-api/jsonld-context/statement-context.jsonld' || item === '/contexts/statement-context');
      if (!knownContext) throw bad('Foreign JSON-LD keywords/contexts are not accepted by this xAPI JSON adapter');
    } else checkKeywords(item, false);
  }
}
function validateActor(actor) {
  if (!isObject(actor) || !['Agent', 'Group'].includes(actor.objectType || 'Agent')) throw bad('actor must be an Agent or Group');
  const identifiers = ['mbox', 'mbox_sha1sum', 'openid', 'account'].filter(key => actor[key] !== undefined);
  if (identifiers.length !== 1 && !(actor.objectType === 'Group' && identifiers.length === 0 && Array.isArray(actor.member) && actor.member.length)) throw bad('Agent/identified Group requires exactly one inverse functional identifier');
  if (actor.mbox !== undefined && !/^mailto:[^\s<>]+@[^\s<>]+$/i.test(actor.mbox)) throw bad('Invalid actor mbox');
  if (actor.openid !== undefined && !iri(actor.openid)) throw bad('Invalid actor openid');
  if (actor.mbox_sha1sum !== undefined && !/^[0-9a-f]{40}$/i.test(actor.mbox_sha1sum)) throw bad('Invalid mbox_sha1sum');
  if (actor.account !== undefined && (!isObject(actor.account) || !iri(actor.account.homePage) || typeof actor.account.name !== 'string' || !actor.account.name)) throw bad('Invalid actor account');
  if (actor.member !== undefined) {
    if (actor.objectType !== 'Group' || !Array.isArray(actor.member)) throw bad('member requires a Group and an array');
    actor.member.forEach(member => {
      if (!isObject(member) || member.objectType === 'Group') throw bad('Group members must be Agents');
      validateActor(member);
    });
  }
}
function validateStatement(statement, sub = false) {
  if (!isObject(statement)) throw bad('Statement must be a JSON object');
  if (!sub && (typeof statement.id !== 'string' || !UUID.test(statement.id))) throw bad('Statement id must be a UUID');
  validateActor(statement.actor);
  if (!isObject(statement.verb) || !iri(statement.verb.id)) throw bad('verb.id must be an absolute IRI');
  const object = statement.object;
  if (!isObject(object)) throw bad('object must be an xAPI object');
  const kind = object.objectType || 'Activity';
  if (kind === 'Agent' || kind === 'Group') validateActor(object);
  else if (kind === 'StatementRef') { if (typeof object.id !== 'string' || !UUID.test(object.id)) throw bad('StatementRef id must be a UUID'); }
  else if (kind === 'SubStatement') {
    if (sub || ['id', 'stored', 'version', 'authority'].some(key => key in object)) throw bad('Invalid nested SubStatement');
    validateStatement(object, true);
  } else if (kind !== 'Activity' || !iri(object.id)) throw bad('Activity object.id must be an absolute IRI');
  for (const key of ['timestamp', 'stored']) {
    if (statement[key] !== undefined && (typeof statement[key] !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(statement[key]) || !Number.isFinite(Date.parse(statement[key])))) throw bad('Invalid ' + key);
  }
  if (statement.authority !== undefined) validateActor(statement.authority);
}
function actorNode(actor) {
  const node = { ...actor, '@type': LEGACY + (actor.objectType || 'Agent') };
  if (actor.member) node.member = actor.member.map(actorNode);
  return node;
}
function opaqueExtensions(value) {
  if (Array.isArray(value)) return value.map(opaqueExtensions);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key, key === 'extensions' ? { '@value': canonicalJson(item), '@type': RDF + 'JSON' } : opaqueExtensions(item)
  ]));
}
function statementNode(statement, rootIri) {
  const node = JSON.parse(JSON.stringify(statement));
  delete node['@context'];
  node['@type'] = LEGACY + (rootIri ? 'Statement' : 'SubStatement');
  if (rootIri) node['@id'] = rootIri;
  node.actor = actorNode(statement.actor);
  node.verb = { ...statement.verb, '@id': statement.verb.id, '@type': LEGACY + 'Verb' };
  const object = statement.object;
  const kind = object.objectType || 'Activity';
  if (kind === 'Agent' || kind === 'Group') node.object = actorNode(object);
  else if (kind === 'SubStatement') node.object = statementNode(object);
  else if (kind === 'StatementRef') node.object = { ...object, '@type': LEGACY + kind };
  else node.object = { ...object, '@id': object.id, '@type': LEGACY + kind };
  if (statement.authority) node.authority = actorNode(statement.authority);
  return node;
}

async function projectStatement(statement, { contextPath = CONTEXT_PATH } = {}) {
  checkKeywords(statement); validateStatement(statement);
  const context = loadPinnedContext(contextPath);
  const original = JSON.parse(JSON.stringify(statement));
  const sourceJson = canonicalJson(original);
  const sourceSha256 = sha256(sourceJson);
  const id = original.id.toLowerCase();
  const legacyIri = 'urn:uuid:' + id;
  const recordIri = 'urn:xapi-semantic-layer:record:' + id;
  const sourceDocumentIri = 'urn:xapi-semantic-layer:source-json:sha256:' + sourceSha256;
  const legacyGraphIri = 'urn:xapi-semantic-layer:graph:' + id + ':legacy';
  const recordGraphIri = 'urn:xapi-semantic-layer:graph:' + id + ':record';
  const expandedLegacy = await jsonld.expand({ '@context': context, ...opaqueExtensions(statementNode(original, legacyIri)) }, JSONLD_OPTIONS);
  const expandedRecord = [
    { '@id': recordIri, '@type': [FOXXI + 'Statement', PROV + 'Entity'],
      [PROV + 'wasDerivedFrom']: [{ '@id': sourceDocumentIri }],
      'https://schema.org/about': [{ '@id': legacyIri }],
      'http://purl.org/dc/terms/source': [{ '@id': SOURCE }],
      'http://purl.org/dc/terms/references': [
        { '@id': 'https://foxxi-bridge.interego.xwisee.com/ns/xapi/2026.10.1' },
        { '@id': 'urn:sha256:' + CONTEXT_SHA256 }
      ],
      [PROV + 'wasGeneratedBy']: [{ '@id': ADAPTER }],
      [LEGACY + 'id']: [{ '@value': original.id }] },
    { '@id': sourceDocumentIri, '@type': [PROV + 'Entity'],
      [RDF + 'value']: [{ '@value': sourceJson, '@type': RDF + 'JSON' }],
      'http://purl.org/dc/terms/identifier': [{ '@value': 'sha256:' + sourceSha256 }],
      'http://purl.org/dc/terms/source': [{ '@id': SOURCE }] }
  ];
  return { id, original, sourceSha256, contextSha256: CONTEXT_SHA256, sourceModel: SOURCE, adapter: ADAPTER,
    legacyIri, recordIri, sourceDocumentIri, legacyGraphIri, recordGraphIri, expandedLegacy, expandedRecord };
}
module.exports = { projectStatement, loadPinnedContext, canonicalJson, sha256, JSONLD_OPTIONS, LEGACY, FOXXI, UUID, CONTEXT_SHA256 };

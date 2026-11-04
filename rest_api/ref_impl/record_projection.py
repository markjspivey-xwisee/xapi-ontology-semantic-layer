"""Bounded, context-free projection of a retained JSON document, not xAPI certification."""
import hashlib
import json
import re
import uuid

RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
PROV = 'http://www.w3.org/ns/prov#'
DCT = 'http://purl.org/dc/terms/'
FOXXI = 'https://foxxi-bridge.interego.xwisee.com/ns/xapi#'
TARGET_VERSION = '2026.10.1'
PROJECTION = 'urn:xapi-python-reference:projection:1.0.0'
SOURCE_API_BASELINE = 'https://github.com/markjspivey-xwisee/xapi-ontology-semantic-layer/blob/b9cc3995bcdab747d2aaecf4b0cce50ceb3c97b7/rest_api/ref_impl/server.py'
MAX_SOURCE_BYTES = 262144


class ProjectionRefused(ValueError):
    pass


def canonical_json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def uuid_key(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', value):
        raise ProjectionRefused('Record export requires a UUID statement id')
    return str(uuid.UUID(value))


def iri(value):
    return isinstance(value, str) and not re.search(r'[\s<>"{}|^`\\\x00-\x1f\x7f]', value) and bool(re.match(r'^[A-Za-z][A-Za-z0-9+.-]*:.+$', value))


def agent(value):
    if not isinstance(value, dict) or value.get('objectType', 'Agent') != 'Agent' or 'member' in value:
        return False
    return one_identifier(value)


def one_identifier(value):
    identifiers = [key for key in ('mbox', 'mbox_sha1sum', 'openid', 'account') if key in value]
    if len(identifiers) != 1:
        return False
    key = identifiers[0]
    if key == 'mbox':
        return isinstance(value[key], str) and bool(re.fullmatch(r'mailto:[^\s<>]+@[^\s<>]+', value[key], re.IGNORECASE))
    if key == 'openid':
        return iri(value[key])
    if key == 'mbox_sha1sum':
        return isinstance(value[key], str) and bool(re.fullmatch(r'[0-9a-fA-F]{40}', value[key]))
    account = value.get('account')
    return isinstance(account, dict) and iri(account.get('homePage')) and isinstance(account.get('name'), str) and bool(account['name'])


def actor(value):
    if not isinstance(value, dict):
        return False
    if value.get('objectType', 'Agent') == 'Agent':
        return agent(value)
    if value.get('objectType') != 'Group':
        return False
    members = value.get('member', [])
    if not isinstance(members, list) or not all(agent(member) for member in members):
        return False
    identifiers = [key for key in ('mbox', 'mbox_sha1sum', 'openid', 'account') if key in value]
    return one_identifier(value) if identifiers else bool(members)


def object_ref(value):
    if not isinstance(value, dict):
        return False
    kind = value.get('objectType', 'Activity')
    if kind == 'Activity':
        return iri(value.get('id'))
    if kind in ('Agent', 'Group'):
        return actor(value)
    if kind == 'StatementRef':
        try:
            uuid_key(value.get('id'))
            return True
        except ProjectionRefused:
            return False
    return False


def project(statement):
    if not isinstance(statement, dict):
        raise ProjectionRefused('Record export requires a JSON statement object')
    sid = uuid_key(statement.get('id'))
    if not actor(statement.get('actor')) or not isinstance(statement.get('verb'), dict) or not iri(statement['verb'].get('id')) or not object_ref(statement.get('object')):
        raise ProjectionRefused('Record export requires an identifiable Actor, Verb IRI and supported Object (Activity, Agent, Group or StatementRef)')
    version = statement.get('version')
    if 'version' in statement and (not isinstance(version, str) or not version):
        raise ProjectionRefused('An explicit protocol version must be a nonempty string')
    try:
        source = canonical_json(statement)
        encoded = source.encode('utf-8')
    except (ValueError, TypeError, UnicodeError) as error:
        raise ProjectionRefused('Source must be finite, UTF-8 JSON') from error
    if len(encoded) > MAX_SOURCE_BYTES:
        raise ProjectionRefused('Record export source exceeds 262144 UTF-8 bytes; original remains readable')
    digest = hashlib.sha256(encoded).hexdigest()
    record = 'urn:xapi-python-reference:record:' + sid
    entity = 'urn:xapi-python-reference:source-json:sha256:' + digest
    # Caller JSON is retained as a literal, never expanded as JSON-LD.
    triples = [
        (record, RDF + 'type', FOXXI + 'Statement', None),
        (record, RDF + 'type', PROV + 'Entity', None),
        (record, PROV + 'wasDerivedFrom', entity, None),
        (record, DCT + 'references', FOXXI[:-1] + '/2026.10.1', None),
        (record, DCT + 'references', PROJECTION, None),
        (record, DCT + 'identifier', sid, ''),
        (entity, RDF + 'type', PROV + 'Entity', None),
        (entity, RDF + 'value', source, RDF + 'JSON'),
        (entity, DCT + 'identifier', 'sha256:' + digest, ''),
    ]
    if version is not None:
        triples.append((record, 'https://schema.org/version', version, ''))
    provenance = {
        'statementId': statement['id'], 'recordIri': record, 'recordClass': FOXXI + 'Statement',
        'sourceJsonIri': entity, 'sourceJsonCanonicalSha256': digest, 'originalJson': statement,
        'canonicalSourceJson': source, 'sourceProtocolVersion': version,
        'sourceOntology': None, 'legacyActivity': None,
        'targetOntology': FOXXI[:-1], 'targetOntologyVersion': TARGET_VERSION,
        'projectionVersion': '1.0.0', 'readerBaseline': SOURCE_API_BASELINE,
        'storage': 'in-memory', 'scope': 'bounded structural projection; not protocol or SHACL certification',
    }
    nodes = {}
    lines = []
    for subject, predicate, value, datatype in triples:
        node = nodes.setdefault(subject, {'@id': subject})
        obj = {'@id': value} if datatype is None else {'@value': value, **({'@type': datatype} if datatype else {})}
        node.setdefault(predicate, []).append(obj)
        term = '<' + value + '>' if datatype is None else json.dumps(value, ensure_ascii=False) + ('^^<' + datatype + '>' if datatype else '')
        lines.append('<' + subject + '> <' + predicate + '> ' + term + ' .')
    return {'provenance': provenance, 'turtle': '\n'.join(lines) + '\n', 'jsonld': {'@graph': list(nodes.values())}}

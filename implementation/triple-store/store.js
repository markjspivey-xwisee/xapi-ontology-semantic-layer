const fs = require('node:fs');
const path = require('node:path');
const rdfstore = require('rdfstore');
const { promisify } = require('node:util');
const jsonld = require('jsonld');
const N3 = require('n3');
const { projectStatement, canonicalJson, JSONLD_OPTIONS, LEGACY } = require('../statement-projection');

// A reference in-memory store, not durable storage or an xAPI-certified LRS.
class XapiTripleStore {
  constructor() {
    this.store = null;
    this.ready = null;
    this.originals = new Map();
    this.ingestions = Promise.resolve();
  }
  async initialize() {
    if (!this.ready) this.ready = (async () => {
      this.store = await promisify(rdfstore.create)();
      for (const [file, graph] of [['xapi.ttl', LEGACY], ['xapi-shapes.ttl', LEGACY + 'shapes']]) {
        const data = fs.readFileSync(path.join(__dirname, '..', '..', 'ontology', file), 'utf8');
        await this.importTurtleData(data, graph);
      }
    })();
    await this.ready;
  }
  importTurtleData(data, graph) {
    return new Promise((resolve, reject) => this.store.load('text/turtle', data, graph, (error, result) => error ? reject(error) : resolve(result)));
  }
  importJsonldData(data, graph) {
    return new Promise((resolve, reject) => this.store.load('application/ld+json', JSON.stringify(data), graph, (error, result) => error ? reject(error) : resolve(result)));
  }
  async executeQuery(query) {
    await this.initialize();
    await this.ingestions;
    const graphs = [LEGACY, LEGACY + 'shapes', ...[...this.originals.values()].flatMap(item => [item.legacyGraphIri, item.recordGraphIri])];
    return new Promise((resolve, reject) => this.store.executeWithEnvironment(query, graphs, graphs, (error, results) => error ? reject(error) : resolve(results)));
  }
  addStatement(statement) {
    // Serialize commits so concurrent same-UUID requests cannot bypass immutability.
    const ingestion = this.ingestions.then(() => this.commitStatement(statement));
    this.ingestions = ingestion.catch(() => {});
    return ingestion;
  }
  async commitStatement(statement) {
    try {
      await this.initialize();
      const projection = await projectStatement(statement);
      const previous = this.originals.get(projection.id);
      if (previous) {
        if (canonicalJson(previous.original) !== canonicalJson(projection.original)) return { success: false, code: 'statement_conflict', error: 'This UUID already identifies a different original statement' };
        return { success: true, id: previous.original.id, recordIri: previous.recordIri, duplicate: true };
      }
      try {
        await this.importJsonldData(projection.expandedLegacy, projection.legacyGraphIri);
        await this.importJsonldData(projection.expandedRecord, projection.recordGraphIri);
      } catch (error) {
        for (const graph of [projection.legacyGraphIri, projection.recordGraphIri]) {
          await new Promise((resolve, reject) => this.store.execute('CLEAR GRAPH <' + graph + '>', error => error ? reject(error) : resolve()));
        }
        throw error;
      }
      this.originals.set(projection.id, projection);
      return { success: true, id: projection.original.id, recordIri: projection.recordIri, duplicate: false };
    } catch (error) { return { success: false, code: error.code || 'storage_error', error: error.message }; }
  }
  getProjection(id) { return this.originals.get(String(id).toLowerCase()); }
  getOriginal(id) {
    const projection = this.getProjection(id);
    return projection ? JSON.parse(JSON.stringify(projection.original)) : undefined;
  }
  async exportStatement(id, kind, format) {
    const projection = this.getProjection(id);
    if (!projection) return undefined;
    await this.ingestions;
    const graphIri = kind === 'record' ? projection.recordGraphIri : projection.legacyGraphIri;
    const graph = await new Promise((resolve, reject) => this.store.graph(graphIri, (error, result) => error ? reject(error) : resolve(result)));
    // rdfstore's legacy toNT does not escape literal quotes/newlines. Use the
    // locked RDF serializer over actual stored terms, including the source JSON.
    const term = node => {
      if (node.interfaceName === 'NamedNode') return N3.DataFactory.namedNode(node.nominalValue);
      if (node.interfaceName === 'BlankNode') return N3.DataFactory.blankNode(node.nominalValue.replace(/^_:/, ''));
      if (node.interfaceName === 'Literal') {
        const datatype = node.datatype || node.type;
        return N3.DataFactory.literal(node.nominalValue, node.language || (datatype ? N3.DataFactory.namedNode(String(datatype)) : undefined));
      }
      throw new Error('Unknown stored RDF term');
    };
    const writer = new N3.Writer({ format: 'N-Triples' });
    for (const triple of graph.toArray()) writer.addQuad(term(triple.subject), term(triple.predicate), term(triple.object));
    const ntriples = await new Promise((resolve, reject) => writer.end((error, data) => error ? reject(error) : resolve(data)));
    if (format === 'jsonld') return jsonld.fromRDF(ntriples, { ...JSONLD_OPTIONS, format: 'application/n-quads' });
    // N-Triples is a Turtle subset, read back from the actual RDF store.
    return ntriples;
  }
  async getStatements(filters = {}) {
    const literal = value => JSON.stringify(String(value));
    let query = 'PREFIX xapi: <' + LEGACY + '> SELECT DISTINCT ?statement ?actor ?verb ?object ?timestamp WHERE { ' +
      '?statement a xapi:Statement; xapi:actor ?actor; xapi:verb ?verb; xapi:object ?object. OPTIONAL { ?statement xapi:timestamp ?timestamp. } ';
    if (filters.actorId) query += '?actor xapi:mbox ?mbox. FILTER(STR(?mbox) = ' + literal(filters.actorId) + ') ';
    if (filters.verbId) query += 'FILTER(STR(?verb) = ' + literal(filters.verbId) + ') ';
    if (filters.objectId) query += 'FILTER(STR(?object) = ' + literal(filters.objectId) + ') ';
    if (filters.since) query += 'FILTER(?timestamp >= "' + new Date(filters.since).toISOString() + '"^^<http://www.w3.org/2001/XMLSchema#dateTime>) ';
    if (filters.until) query += 'FILTER(?timestamp <= "' + new Date(filters.until).toISOString() + '"^^<http://www.w3.org/2001/XMLSchema#dateTime>) ';
    query += '} LIMIT ' + Math.min(100, Math.max(1, Number.parseInt(filters.limit, 10) || 50));
    try { return { success: true, statements: await this.executeQuery(query) }; }
    catch (error) { return { success: false, error: error.message }; }
  }
}
const tripleStore = new XapiTripleStore();
module.exports = tripleStore;
module.exports.XapiTripleStore = XapiTripleStore;

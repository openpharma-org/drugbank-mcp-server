#!/usr/bin/env node

/**
 * DrugBank SQLite Database Builder
 *
 * Converts the 1.5GB DrugBank XML file into an efficient SQLite database
 * This is a one-time operation that takes 2-5 minutes
 *
 * Benefits:
 * - Queries: <10ms (vs 30-60s first load)
 * - Memory: ~50-100MB (vs 2-3GB)
 * - Size: ~400-600MB (vs 1.5GB XML in RAM)
 */

import Database from 'better-sqlite3';
import XmlStream from 'xml-stream';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const XML_FILE = path.join(DATA_DIR, 'full database.xml');
const DB_FILE = path.join(DATA_DIR, 'drugbank.db');

console.log('[DB Builder] Starting DrugBank database build...');
console.log('[DB Builder] This will take 2-5 minutes');
console.log('[DB Builder] Using streaming XML parser for 1.5GB file...');

const startTime = Date.now();

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  console.log('[DB Builder] Creating data directory...');
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Delete existing database
if (fs.existsSync(DB_FILE)) {
  console.log('[DB Builder] Removing existing database...');
  fs.unlinkSync(DB_FILE);
}

// Create database
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 10000');

console.log('[DB Builder] Creating schema...');

// Create tables
db.exec(`
  CREATE TABLE drugs (
    drugbank_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    cas_number TEXT,
    unii TEXT,
    state TEXT,
    indication TEXT,
    pharmacodynamics TEXT,
    mechanism_of_action TEXT,
    toxicity TEXT,
    absorption TEXT,
    metabolism TEXT,
    half_life TEXT,
    protein_binding TEXT,
    route_of_elimination TEXT,
    average_mass REAL,
    monoisotopic_mass REAL,

    -- JSON columns for complex data
    all_ids TEXT,
    groups TEXT,
    categories TEXT,
    synonyms TEXT,
    calculated_properties TEXT,
    external_identifiers TEXT,
    drug_interactions TEXT,
    food_interactions TEXT,
    targets TEXT,
    enzymes TEXT,
    carriers TEXT,
    transporters TEXT,
    pathways TEXT,
    products TEXT,
    atc_codes TEXT
  );

  CREATE INDEX idx_name ON drugs(name COLLATE NOCASE);
  CREATE INDEX idx_indication ON drugs(indication);
  CREATE INDEX idx_cas ON drugs(cas_number);
  CREATE INDEX idx_unii ON drugs(unii);

  -- Full-text search
  CREATE VIRTUAL TABLE drugs_fts USING fts5(
    drugbank_id,
    name,
    description,
    indication,
    content=drugs,
    content_rowid=rowid
  );

  -- Triggers to keep FTS in sync
  CREATE TRIGGER drugs_ai AFTER INSERT ON drugs BEGIN
    INSERT INTO drugs_fts(rowid, drugbank_id, name, description, indication)
    VALUES (new.rowid, new.drugbank_id, new.name, new.description, new.indication);
  END;

  CREATE TRIGGER drugs_ad AFTER DELETE ON drugs BEGIN
    INSERT INTO drugs_fts(drugs_fts, rowid, drugbank_id, name, description, indication)
    VALUES ('delete', old.rowid, old.drugbank_id, old.name, old.description, old.indication);
  END;

  CREATE TRIGGER drugs_au AFTER UPDATE ON drugs BEGIN
    INSERT INTO drugs_fts(drugs_fts, rowid, drugbank_id, name, description, indication)
    VALUES ('delete', old.rowid, old.drugbank_id, old.name, old.description, old.indication);
    INSERT INTO drugs_fts(rowid, drugbank_id, name, description, indication)
    VALUES (new.rowid, new.drugbank_id, new.name, new.description, new.indication);
  END;

  -- Separate tables for searchable entities
  CREATE TABLE drug_targets (
    drug_id TEXT,
    target_name TEXT,
    organism TEXT,
    FOREIGN KEY (drug_id) REFERENCES drugs(drugbank_id)
  );
  CREATE INDEX idx_target_name ON drug_targets(target_name COLLATE NOCASE);

  CREATE TABLE drug_categories (
    drug_id TEXT,
    category TEXT,
    FOREIGN KEY (drug_id) REFERENCES drugs(drugbank_id)
  );
  CREATE INDEX idx_category ON drug_categories(category COLLATE NOCASE);
`);

console.log('[DB Builder] Streaming and parsing XML...');

// Prepare insert statement
const insertDrug = db.prepare(`
  INSERT INTO drugs (
    drugbank_id, name, description, cas_number, unii, state,
    indication, pharmacodynamics, mechanism_of_action, toxicity,
    absorption, metabolism, half_life, protein_binding, route_of_elimination,
    average_mass, monoisotopic_mass,
    all_ids, groups, categories, synonyms, calculated_properties,
    external_identifiers, drug_interactions, food_interactions,
    targets, enzymes, carriers, transporters, pathways, products, atc_codes
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?
  )
`);

const insertTarget = db.prepare('INSERT INTO drug_targets (drug_id, target_name, organism) VALUES (?, ?, ?)');
const insertCategory = db.prepare('INSERT INTO drug_categories (drug_id, category) VALUES (?, ?)');

// Create a simple transaction wrapper that processes ONE drug at a time
const insertOneDrug = db.transaction((drugbankId, drugParams, targets, categories) => {
  insertDrug.run(...drugParams);

  for (const target of targets) {
    if (target.name) {
      insertTarget.run(drugbankId, target.name, target.organism || null);
    }
  }

  for (const category of categories) {
    insertCategory.run(drugbankId, category);
  }
});

// Helper functions
function getPrimaryDrugBankId(drug) {
  if (!drug['drugbank-id']) return null;
  let ids = drug['drugbank-id'];
  if (!Array.isArray(ids)) ids = [ids];

  // xml-stream uses '$' for attributes and '$text' for text
  const primaryId = ids.find(id => {
    if (typeof id === 'string') return false;
    return id.$?.primary === 'true' || id.$?.primary === true;
  });

  if (primaryId) {
    return typeof primaryId === 'string' ? primaryId : (primaryId.$text || primaryId);
  }

  return typeof ids[0] === 'string' ? ids[0] : (ids[0].$text || ids[0]);
}

function getAllIds(drug) {
  if (!drug['drugbank-id']) return [];
  let ids = drug['drugbank-id'];
  if (!Array.isArray(ids)) ids = [ids];
  return ids.map(id => typeof id === 'string' ? id : (id.$text || id)).filter(Boolean);
}

function extractArray(data) {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function extractGroups(drug) {
  const groups = drug.groups?.group || [];
  return extractArray(groups);
}

function extractCategories(drug) {
  const cats = drug.categories?.category || [];
  const catArray = extractArray(cats);
  return catArray.map(cat => typeof cat === 'string' ? cat : cat.category || cat['#text']).filter(Boolean);
}

function extractSynonyms(drug) {
  const syns = drug.synonyms?.synonym || [];
  const synArray = extractArray(syns);
  return synArray.map(syn => typeof syn === 'string' ? syn : syn['#text']).filter(Boolean);
}

function extractCalculatedProperties(drug) {
  const props = drug['calculated-properties']?.property || [];
  const propArray = extractArray(props);
  const result = {};
  propArray.forEach(prop => {
    if (prop.kind && prop.value) result[prop.kind] = prop.value;
  });
  return result;
}

function extractExternalIdentifiers(drug) {
  const ids = drug['external-identifiers']?.['external-identifier'] || [];
  const idArray = extractArray(ids);
  const result = {};
  idArray.forEach(id => {
    if (id.resource && id.identifier) result[id.resource] = id.identifier;
  });
  return result;
}

function extractDrugInteractions(drug) {
  const interactions = drug['drug-interactions']?.['drug-interaction'] || [];
  const intArray = extractArray(interactions);
  return intArray.slice(0, 100).map(int => ({
    drugbank_id: int['drugbank-id'] || null,
    name: int.name || null,
    description: int.description || null
  }));
}

function extractFoodInteractions(drug) {
  const interactions = drug['food-interactions']?.['food-interaction'] || [];
  return extractArray(interactions);
}

function extractTargets(drug) {
  const targets = drug.targets?.target || [];
  const targetArray = extractArray(targets);
  return targetArray.slice(0, 50).map(t => ({
    id: t.id || null,
    name: t.name || null,
    organism: t.organism || null,
    known_action: t['known-action'] || null
  }));
}

function extractEnzymes(drug) {
  const enzymes = drug.enzymes?.enzyme || [];
  const enzymeArray = extractArray(enzymes);
  return enzymeArray.slice(0, 50).map(e => ({
    id: e.id || null,
    name: e.name || null,
    organism: e.organism || null
  }));
}

function extractPathways(drug) {
  const pathways = drug.pathways?.pathway || [];
  const pathwayArray = extractArray(pathways);
  return pathwayArray.map(p => ({
    smpdb_id: p['smpdb-id'] || null,
    name: p.name || null,
    category: p.category || null
  }));
}

function extractProducts(drug) {
  const products = drug.products?.product || [];
  const productArray = extractArray(products);
  return productArray.slice(0, 100).map(p => ({
    name: p.name || null,
    labeller: p.labeller || null,
    country: p.country || null,
    approved: p.approved || null
  }));
}

function extractAtcCodes(drug) {
  const codes = drug['atc-codes']?.['atc-code'] || [];
  const codeArray = extractArray(codes);
  return codeArray.map(code => {
    if (typeof code === 'string') return code;
    // xml-stream uses '$' for attributes
    return code.$?.code || code.$text || null;
  }).filter(Boolean);
}

// Process drugs using streaming
const stream = fs.createReadStream(XML_FILE);
const xml = new XmlStream(stream);

// DON'T use collect() - it causes memory issues
// xml-stream will automatically collect sub-elements

let count = 0;
let seenIds = new Set();

xml.on('endElement: drug', function(drug) {
  try {
    // Only process top-level drug elements (with type attribute)
    // Skip nested drug references (they don't have type attribute)
    if (!drug.$ || !drug.$.type) return;

    const drugbankId = getPrimaryDrugBankId(drug);
    if (!drugbankId) return;

    // Skip duplicates (xml-stream may emit multiple times for nested structures)
    if (seenIds.has(drugbankId)) return;
    seenIds.add(drugbankId);

    const categories = extractCategories(drug);
    const targets = extractTargets(drug);

    // Insert immediately using transaction (not batching in memory)
    insertOneDrug(
      drugbankId,
      [
        drugbankId,
        drug.name || null,
        drug.description || null,
        drug['cas-number'] || null,
        drug.unii || null,
        drug.state || null,
        drug.indication || null,
        drug.pharmacodynamics || null,
        drug['mechanism-of-action'] || null,
        drug.toxicity || null,
        drug.absorption || null,
        drug.metabolism || null,
        drug['half-life'] || null,
        drug['protein-binding'] || null,
        drug['route-of-elimination'] || null,
        drug['average-mass'] || null,
        drug['monoisotopic-mass'] || null,
        JSON.stringify(getAllIds(drug)),
        JSON.stringify(extractGroups(drug)),
        JSON.stringify(categories),
        JSON.stringify(extractSynonyms(drug)),
        JSON.stringify(extractCalculatedProperties(drug)),
        JSON.stringify(extractExternalIdentifiers(drug)),
        JSON.stringify(extractDrugInteractions(drug)),
        JSON.stringify(extractFoodInteractions(drug)),
        JSON.stringify(targets),
        JSON.stringify(extractEnzymes(drug)),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify(extractPathways(drug)),
        JSON.stringify(extractProducts(drug)),
        JSON.stringify(extractAtcCodes(drug))
      ],
      targets.filter(t => t.name),
      categories
    );

    count++;

    if (count % 100 === 0) {
      console.log(`[DB Builder] Processed ${count} drugs...`);
    }
  } catch (error) {
    console.error(`[DB Builder] Error processing drug ${drugbankId || 'unknown'}:`, error.message);
    if (count < 5) {
      console.error(`[DB Builder] Stack:`, error.stack);
    }
  }
});

xml.on('end', function() {
  console.log(`[DB Builder] Inserted ${count} drugs`);
  console.log('[DB Builder] Optimizing database...');

  // Optimize
  db.pragma('optimize');

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const size = (fs.statSync(DB_FILE).size / (1024 * 1024)).toFixed(1);

  console.log(`[DB Builder] ✓ Database built successfully!`);
  console.log(`[DB Builder] Time: ${duration}s`);
  console.log(`[DB Builder] Size: ${size}MB`);
  console.log(`[DB Builder] Location: ${DB_FILE}`);

  db.close();
});

xml.on('error', function(err) {
  console.error('[DB Builder] XML parsing error:', err);
  process.exit(1);
});

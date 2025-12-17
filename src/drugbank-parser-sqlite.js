#!/usr/bin/env node

/**
 * DrugBank SQLite Parser
 *
 * Fast, memory-efficient parser using SQLite database
 * Queries are <10ms vs 30-60s initial load with XML
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the SQLite database
const DB_FILE = path.join(__dirname, '..', 'data', 'drugbank.db');

let db = null;

/**
 * Initialize database connection (lazy)
 */
function getDb() {
  if (!db) {
    db = new Database(DB_FILE, { readonly: true });
    db.pragma('journal_mode = WAL');
    console.error('[DrugBank Parser] Connected to SQLite database');
  }
  return db;
}

/**
 * Get drug by DrugBank ID
 */
export async function getDrugById(drugbankId) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM drugs WHERE drugbank_id = ?');
  const drug = stmt.get(drugbankId);

  return drug ? parseDrugRow(drug) : null;
}

/**
 * Search drugs by name (case-insensitive, using FTS5)
 */
export async function searchDrugsByName(query, limit = 20) {
  const database = getDb();

  // Use FTS5 for fast full-text search
  const stmt = database.prepare(`
    SELECT drugs.* FROM drugs_fts
    JOIN drugs ON drugs_fts.drugbank_id = drugs.drugbank_id
    WHERE drugs_fts.name MATCH ?
    LIMIT ?
  `);

  const drugs = stmt.all(query, limit);
  return drugs.map(drug => extractDrugSummary(parseDrugRow(drug)));
}

/**
 * Search drugs by indication
 */
export async function searchDrugsByIndication(query, limit = 20) {
  const database = getDb();

  // Use FTS5 for fast search
  const stmt = database.prepare(`
    SELECT drugs.* FROM drugs_fts
    JOIN drugs ON drugs_fts.drugbank_id = drugs.drugbank_id
    WHERE drugs_fts.indication MATCH ?
    LIMIT ?
  `);

  const drugs = stmt.all(query, limit);
  return drugs.map(drug => extractDrugSummary(parseDrugRow(drug)));
}

/**
 * Search drugs by target
 */
export async function searchDrugsByTarget(target, limit = 20) {
  const database = getDb();

  const stmt = database.prepare(`
    SELECT DISTINCT drugs.* FROM drug_targets
    JOIN drugs ON drug_targets.drug_id = drugs.drugbank_id
    WHERE drug_targets.target_name LIKE ?
    LIMIT ?
  `);

  const drugs = stmt.all(`%${target}%`, limit);
  return drugs.map(drug => extractDrugSummary(parseDrugRow(drug)));
}

/**
 * Search drugs by category
 */
export async function searchDrugsByCategory(category, limit = 20) {
  const database = getDb();

  const stmt = database.prepare(`
    SELECT DISTINCT drugs.* FROM drug_categories
    JOIN drugs ON drug_categories.drug_id = drugs.drugbank_id
    WHERE drug_categories.category LIKE ?
    LIMIT ?
  `);

  const drugs = stmt.all(`%${category}%`, limit);
  return drugs.map(drug => extractDrugSummary(parseDrugRow(drug)));
}

/**
 * Search drugs by ATC code
 */
export async function searchDrugsByAtcCode(code, limit = 20) {
  const database = getDb();

  const stmt = database.prepare(`
    SELECT * FROM drugs
    WHERE atc_codes LIKE ?
    LIMIT ?
  `);

  const drugs = stmt.all(`%${code}%`, limit);
  return drugs.map(drug => parseDrugRow(drug));
}

/**
 * Search drugs by chemical structure (SMILES/InChI)
 * Note: This is a simplified substring search
 */
export async function searchDrugsByStructure(smiles, inchi, limit = 20) {
  const database = getDb();
  const searchQuery = smiles || inchi;

  const stmt = database.prepare(`
    SELECT * FROM drugs
    WHERE calculated_properties LIKE ?
    LIMIT ?
  `);

  const drugs = stmt.all(`%${searchQuery}%`, limit);
  return drugs.map(drug => parseDrugRow(drug));
}

/**
 * Parse drug row from database (JSON columns)
 */
function parseDrugRow(row) {
  return {
    ...row,
    all_ids: safeJsonParse(row.all_ids),
    groups: safeJsonParse(row.groups),
    categories: safeJsonParse(row.categories),
    synonyms: safeJsonParse(row.synonyms),
    calculated_properties: safeJsonParse(row.calculated_properties),
    external_identifiers: safeJsonParse(row.external_identifiers),
    drug_interactions: safeJsonParse(row.drug_interactions),
    food_interactions: safeJsonParse(row.food_interactions),
    targets: safeJsonParse(row.targets),
    enzymes: safeJsonParse(row.enzymes),
    carriers: safeJsonParse(row.carriers),
    transporters: safeJsonParse(row.transporters),
    pathways: safeJsonParse(row.pathways),
    products: safeJsonParse(row.products),
    atc_codes: safeJsonParse(row.atc_codes)
  };
}

/**
 * Safely parse JSON (return empty array/object on error)
 */
function safeJsonParse(jsonString) {
  if (!jsonString) return [];
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return [];
  }
}

/**
 * Extract simplified drug info for response
 */
export function extractDrugSummary(drug) {
  if (!drug) return null;

  return {
    drugbank_id: drug.drugbank_id,
    name: drug.name || 'Unknown',
    description: drug.description || 'No description available',
    groups: drug.groups || [],
    cas_number: drug.cas_number || null,
    state: drug.state || null
  };
}

/**
 * Extract complete drug details
 */
export function extractDrugDetails(drug) {
  if (!drug) return null;

  return {
    drugbank_id: drug.drugbank_id,
    all_ids: drug.all_ids || [],
    name: drug.name || 'Unknown',
    description: drug.description || null,
    cas_number: drug.cas_number || null,
    unii: drug.unii || null,
    state: drug.state || null,
    groups: drug.groups || [],
    categories: drug.categories || [],

    // Clinical information
    indication: drug.indication || null,
    pharmacodynamics: drug.pharmacodynamics || null,
    mechanism_of_action: drug.mechanism_of_action || null,
    toxicity: drug.toxicity || null,

    // Pharmacokinetics
    absorption: drug.absorption || null,
    metabolism: drug.metabolism || null,
    half_life: drug.half_life || null,
    protein_binding: drug.protein_binding || null,
    route_of_elimination: drug.route_of_elimination || null,

    // Chemical properties
    average_mass: drug.average_mass || null,
    monoisotopic_mass: drug.monoisotopic_mass || null,
    calculated_properties: drug.calculated_properties || {},

    // External identifiers
    external_identifiers: drug.external_identifiers || {},

    // Interactions
    drug_interactions: drug.drug_interactions || [],
    food_interactions: drug.food_interactions || [],

    // Targets
    targets: drug.targets || [],
    enzymes: drug.enzymes || []
  };
}

// Dummy load function for compatibility
export async function loadDatabase() {
  getDb();
  return true;
}

export default {
  loadDatabase,
  getDrugById,
  searchDrugsByName,
  searchDrugsByIndication,
  searchDrugsByTarget,
  searchDrugsByCategory,
  searchDrugsByAtcCode,
  searchDrugsByStructure,
  extractDrugSummary,
  extractDrugDetails
};

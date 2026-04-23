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

  // Normalize the search term: lowercase and replace hyphens with spaces
  // This matches Open Targets format ("glucagon like peptide 1 receptor")
  // with DrugBank format ("Glucagon-like peptide 1 receptor")
  const normalizedTarget = target.toLowerCase().replace(/-/g, ' ');

  const stmt = database.prepare(`
    SELECT DISTINCT drugs.* FROM drug_targets
    JOIN drugs ON drug_targets.drug_id = drugs.drugbank_id
    WHERE LOWER(REPLACE(drug_targets.target_name, '-', ' ')) LIKE ?
    LIMIT ?
  `);

  const drugs = stmt.all(`%${normalizedTarget}%`, limit);
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
 * Search drugs by carrier protein
 */
export async function searchDrugsByCarrier(carrier, limit = 20) {
  const database = getDb();

  const stmt = database.prepare(`
    SELECT DISTINCT drugs.*, dc.carrier_name, dc.organism, dc.known_action
    FROM drug_carriers dc
    JOIN drugs ON dc.drug_id = drugs.drugbank_id
    WHERE dc.carrier_name LIKE ?
    LIMIT ?
  `);

  const results = stmt.all(`%${carrier}%`, limit);
  return results.map(row => {
    const drug = parseDrugRow(row);
    return {
      ...extractDrugSummary(drug),
      matched_carrier: {
        name: row.carrier_name,
        organism: row.organism,
        known_action: row.known_action
      }
    };
  });
}

/**
 * Search drugs by transporter protein
 */
export async function searchDrugsByTransporter(transporter, limit = 20) {
  const database = getDb();

  const stmt = database.prepare(`
    SELECT DISTINCT drugs.*, dt.transporter_name, dt.organism, dt.known_action
    FROM drug_transporters dt
    JOIN drugs ON dt.drug_id = drugs.drugbank_id
    WHERE dt.transporter_name LIKE ?
    LIMIT ?
  `);

  const results = stmt.all(`%${transporter}%`, limit);
  return results.map(row => {
    const drug = parseDrugRow(row);
    return {
      ...extractDrugSummary(drug),
      matched_transporter: {
        name: row.transporter_name,
        organism: row.organism,
        known_action: row.known_action
      }
    };
  });
}

/**
 * Get salts for a drug
 */
export async function getDrugSalts(drugbankId) {
  const database = getDb();

  const stmt = database.prepare(`
    SELECT * FROM drug_salts
    WHERE drug_id = ?
  `);

  const salts = stmt.all(drugbankId);
  return salts.map(s => ({
    salt_id: s.salt_id,
    name: s.salt_name,
    unii: s.unii,
    cas_number: s.cas_number,
    inchikey: s.inchikey,
    average_mass: s.average_mass
  }));
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
 * Search drugs by half-life range (in hours)
 */
export async function searchDrugsByHalfLife(minHours, maxHours, limit = 20) {
  const database = getDb();

  let stmt;
  let drugs;

  if (minHours !== null && maxHours !== null) {
    stmt = database.prepare(`
      SELECT * FROM drugs
      WHERE half_life_hours IS NOT NULL
        AND half_life_hours >= ?
        AND half_life_hours <= ?
      ORDER BY half_life_hours ASC
      LIMIT ?
    `);
    drugs = stmt.all(minHours, maxHours, limit);
  } else if (minHours !== null) {
    stmt = database.prepare(`
      SELECT * FROM drugs
      WHERE half_life_hours IS NOT NULL
        AND half_life_hours >= ?
      ORDER BY half_life_hours ASC
      LIMIT ?
    `);
    drugs = stmt.all(minHours, limit);
  } else if (maxHours !== null) {
    stmt = database.prepare(`
      SELECT * FROM drugs
      WHERE half_life_hours IS NOT NULL
        AND half_life_hours <= ?
      ORDER BY half_life_hours ASC
      LIMIT ?
    `);
    drugs = stmt.all(maxHours, limit);
  } else {
    // No range specified, return drugs with known half-life
    stmt = database.prepare(`
      SELECT * FROM drugs
      WHERE half_life_hours IS NOT NULL
      ORDER BY half_life_hours ASC
      LIMIT ?
    `);
    drugs = stmt.all(limit);
  }

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

/**
 * Find drugs similar to a given drug based on shared targets, categories, and ATC codes
 * Returns drugs with similarity scores
 */
export async function findSimilarDrugs(drugbankId, limit = 20) {
  const database = getDb();

  // Get the reference drug
  const refDrug = await getDrugById(drugbankId);
  if (!refDrug) return [];

  // Get targets, categories, and ATC codes for the reference drug
  const refTargets = new Set((refDrug.targets || []).map(t => t.name?.toLowerCase()).filter(Boolean));
  const refCategories = new Set((refDrug.categories || []).map(c => (typeof c === 'string' ? c : c.category)?.toLowerCase()).filter(Boolean));
  const refAtcCodes = new Set((refDrug.atc_codes || []).map(c => c?.substring(0, 5))); // Use first 5 chars (therapeutic level)

  if (refTargets.size === 0 && refCategories.size === 0 && refAtcCodes.size === 0) {
    return []; // No data to compare
  }

  // Find candidate drugs (those sharing at least one target or category)
  const candidateIds = new Set();

  // Find drugs with shared targets
  if (refTargets.size > 0) {
    const targetStmt = database.prepare(`
      SELECT DISTINCT drug_id FROM drug_targets
      WHERE LOWER(target_name) IN (${[...refTargets].map(() => '?').join(',')})
      AND drug_id != ?
    `);
    const targetDrugs = targetStmt.all(...refTargets, drugbankId);
    targetDrugs.forEach(d => candidateIds.add(d.drug_id));
  }

  // Find drugs with shared categories
  if (refCategories.size > 0) {
    const catStmt = database.prepare(`
      SELECT DISTINCT drug_id FROM drug_categories
      WHERE LOWER(category) IN (${[...refCategories].map(() => '?').join(',')})
      AND drug_id != ?
    `);
    const catDrugs = catStmt.all(...refCategories, drugbankId);
    catDrugs.forEach(d => candidateIds.add(d.drug_id));
  }

  if (candidateIds.size === 0) return [];

  // Score each candidate
  const scoredDrugs = [];
  const candidateArray = [...candidateIds].slice(0, 500); // Limit candidates

  for (const candId of candidateArray) {
    const candDrug = await getDrugById(candId);
    if (!candDrug) continue;

    const candTargets = new Set((candDrug.targets || []).map(t => t.name?.toLowerCase()).filter(Boolean));
    const candCategories = new Set((candDrug.categories || []).map(c => (typeof c === 'string' ? c : c.category)?.toLowerCase()).filter(Boolean));
    const candAtcCodes = new Set((candDrug.atc_codes || []).map(c => c?.substring(0, 5)));

    // Calculate Jaccard similarity for each dimension
    const targetSim = jaccardSimilarity(refTargets, candTargets);
    const categorySim = jaccardSimilarity(refCategories, candCategories);
    const atcSim = jaccardSimilarity(refAtcCodes, candAtcCodes);

    // Weighted composite score (targets matter most for mechanism)
    const score = (targetSim * 0.5) + (categorySim * 0.3) + (atcSim * 0.2);

    if (score > 0) {
      scoredDrugs.push({
        drug: candDrug,
        similarity_score: Math.round(score * 1000) / 1000,
        target_similarity: Math.round(targetSim * 1000) / 1000,
        category_similarity: Math.round(categorySim * 1000) / 1000,
        atc_similarity: Math.round(atcSim * 1000) / 1000,
        shared_targets: [...refTargets].filter(t => candTargets.has(t)),
        shared_categories: [...refCategories].filter(c => candCategories.has(c))
      });
    }
  }

  // Sort by score descending
  scoredDrugs.sort((a, b) => b.similarity_score - a.similarity_score);

  return scoredDrugs.slice(0, limit);
}

/**
 * Jaccard similarity coefficient: |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

export default {
  loadDatabase,
  getDrugById,
  searchDrugsByName,
  searchDrugsByIndication,
  searchDrugsByTarget,
  searchDrugsByCategory,
  searchDrugsByCarrier,
  searchDrugsByTransporter,
  getDrugSalts,
  searchDrugsByAtcCode,
  searchDrugsByStructure,
  searchDrugsByHalfLife,
  findSimilarDrugs,
  extractDrugSummary,
  extractDrugDetails
};

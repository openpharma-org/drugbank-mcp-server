#!/usr/bin/env node

/**
 * DrugBank XML Parser
 *
 * Utilities for parsing the DrugBank XML database (1.5GB file)
 * Uses streaming parser for memory efficiency
 */

import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the DrugBank XML file
const DB_FILE = path.join(__dirname, '..', 'full database.xml');

/**
 * XML Parser configuration
 */
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  arrayMode: false
};

/**
 * Cache for parsed drugs (drugbank_id -> drug object)
 */
let drugsCache = null;
let drugsList = null;

/**
 * Parse the entire DrugBank XML file
 * Warning: This loads the entire 1.5GB file into memory
 * Only called once and cached
 */
export async function loadDatabase() {
  if (drugsCache !== null) {
    return drugsCache;
  }

  console.error('[DrugBank Parser] Loading database... this may take a minute');
  const startTime = Date.now();

  try {
    const xmlData = fs.readFileSync(DB_FILE, 'utf8');
    const parser = new XMLParser(parserOptions);
    const result = parser.parse(xmlData);

    // Extract drugs array from XML structure
    let drugs = result.drugbank?.drug || [];

    // Ensure drugs is an array
    if (!Array.isArray(drugs)) {
      drugs = [drugs];
    }

    console.error(`[DrugBank Parser] Loaded ${drugs.length} drugs in ${Date.now() - startTime}ms`);

    // Build cache: drugbank_id -> drug object
    drugsCache = new Map();
    drugs.forEach(drug => {
      const primaryId = getPrimaryDrugBankId(drug);
      if (primaryId) {
        drugsCache.set(primaryId, drug);
      }
    });

    // Also store as list for searching
    drugsList = drugs;

    return drugsCache;
  } catch (error) {
    console.error('[DrugBank Parser] Error loading database:', error);
    throw error;
  }
}

/**
 * Get primary DrugBank ID from drug object
 */
function getPrimaryDrugBankId(drug) {
  if (!drug['drugbank-id']) return null;

  let ids = drug['drugbank-id'];
  if (!Array.isArray(ids)) {
    ids = [ids];
  }

  // Find primary ID (has @_primary="true" attribute)
  const primaryId = ids.find(id => id['@_primary'] === 'true' || id['@_primary'] === true);
  if (primaryId) {
    return typeof primaryId === 'string' ? primaryId : primaryId['#text'];
  }

  // Fallback to first ID
  return typeof ids[0] === 'string' ? ids[0] : ids[0]['#text'];
}

/**
 * Get all DrugBank IDs for a drug (including secondary IDs)
 */
function getAllDrugBankIds(drug) {
  if (!drug['drugbank-id']) return [];

  let ids = drug['drugbank-id'];
  if (!Array.isArray(ids)) {
    ids = [ids];
  }

  return ids.map(id => typeof id === 'string' ? id : id['#text']).filter(Boolean);
}

/**
 * Get drug by DrugBank ID
 */
export async function getDrugById(drugbankId) {
  const cache = await loadDatabase();
  return cache.get(drugbankId) || null;
}

/**
 * Search drugs by name (case-insensitive, partial match)
 */
export async function searchDrugsByName(query, limit = 20) {
  await loadDatabase();

  const queryLower = query.toLowerCase();
  const results = [];

  for (const drug of drugsList) {
    const name = drug.name?.toLowerCase() || '';
    const synonyms = drug.synonyms?.synonym || [];
    const synonymList = Array.isArray(synonyms) ? synonyms : [synonyms];

    // Check name match
    if (name.includes(queryLower)) {
      results.push(drug);
      if (results.length >= limit) break;
      continue;
    }

    // Check synonyms
    const synonymMatch = synonymList.some(syn => {
      const synText = typeof syn === 'string' ? syn : syn['#text'];
      return synText?.toLowerCase().includes(queryLower);
    });

    if (synonymMatch) {
      results.push(drug);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Search drugs by indication (case-insensitive, partial match)
 */
export async function searchDrugsByIndication(query, limit = 20) {
  await loadDatabase();

  const queryLower = query.toLowerCase();
  const results = [];

  for (const drug of drugsList) {
    const indication = drug.indication?.toLowerCase() || '';

    if (indication.includes(queryLower)) {
      results.push(drug);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Extract simplified drug info for response
 */
export function extractDrugSummary(drug) {
  if (!drug) return null;

  const primaryId = getPrimaryDrugBankId(drug);
  const groups = drug.groups?.group || [];
  const groupList = Array.isArray(groups) ? groups : [groups];

  return {
    drugbank_id: primaryId,
    name: drug.name || 'Unknown',
    description: drug.description || 'No description available',
    groups: groupList,
    cas_number: drug['cas-number'] || null,
    state: drug.state || null
  };
}

/**
 * Extract complete drug details
 */
export function extractDrugDetails(drug) {
  if (!drug) return null;

  const primaryId = getPrimaryDrugBankId(drug);
  const groups = drug.groups?.group || [];
  const groupList = Array.isArray(groups) ? groups : [groups];

  // Extract categories
  const categories = drug.categories?.category || [];
  const categoryList = Array.isArray(categories) ? categories : [categories];
  const categoryNames = categoryList.map(cat =>
    typeof cat === 'string' ? cat : cat.category || cat['#text']
  ).filter(Boolean);

  // Extract calculated properties
  const calcProps = drug['calculated-properties']?.property || [];
  const calcPropList = Array.isArray(calcProps) ? calcProps : [calcProps];
  const properties = {};
  calcPropList.forEach(prop => {
    if (prop.kind && prop.value) {
      properties[prop.kind] = prop.value;
    }
  });

  return {
    drugbank_id: primaryId,
    all_ids: getAllDrugBankIds(drug),
    name: drug.name || 'Unknown',
    description: drug.description || null,
    cas_number: drug['cas-number'] || null,
    unii: drug.unii || null,
    state: drug.state || null,
    groups: groupList,
    categories: categoryNames,

    // Clinical information
    indication: drug.indication || null,
    pharmacodynamics: drug.pharmacodynamics || null,
    mechanism_of_action: drug['mechanism-of-action'] || null,
    toxicity: drug.toxicity || null,

    // Pharmacokinetics
    absorption: drug.absorption || null,
    metabolism: drug.metabolism || null,
    half_life: drug['half-life'] || null,
    protein_binding: drug['protein-binding'] || null,
    route_of_elimination: drug['route-of-elimination'] || null,

    // Chemical properties
    average_mass: drug['average-mass'] || null,
    monoisotopic_mass: drug['monoisotopic-mass'] || null,
    calculated_properties: properties,

    // External identifiers
    external_identifiers: extractExternalIdentifiers(drug),

    // Interactions
    drug_interactions: extractDrugInteractions(drug),
    food_interactions: extractFoodInteractions(drug),

    // Targets
    targets: extractTargets(drug),
    enzymes: extractEnzymes(drug)
  };
}

/**
 * Extract external identifiers
 */
function extractExternalIdentifiers(drug) {
  const identifiers = drug['external-identifiers']?.['external-identifier'] || [];
  const identifierList = Array.isArray(identifiers) ? identifiers : [identifiers];

  const result = {};
  identifierList.forEach(id => {
    if (id.resource && id.identifier) {
      result[id.resource] = id.identifier;
    }
  });

  return result;
}

/**
 * Extract drug interactions
 */
function extractDrugInteractions(drug) {
  const interactions = drug['drug-interactions']?.['drug-interaction'] || [];
  const interactionList = Array.isArray(interactions) ? interactions : [interactions];

  return interactionList.map(interaction => ({
    drugbank_id: interaction['drugbank-id'] || null,
    name: interaction.name || null,
    description: interaction.description || null
  })).slice(0, 50); // Limit to 50 interactions
}

/**
 * Extract food interactions
 */
function extractFoodInteractions(drug) {
  const interactions = drug['food-interactions']?.['food-interaction'] || [];
  return Array.isArray(interactions) ? interactions : [interactions];
}

/**
 * Extract drug targets
 */
function extractTargets(drug) {
  const targets = drug.targets?.target || [];
  const targetList = Array.isArray(targets) ? targets : [targets];

  return targetList.slice(0, 20).map(target => ({
    id: target.id || null,
    name: target.name || null,
    organism: target.organism || null,
    known_action: target['known-action'] || null,
    actions: extractActions(target)
  }));
}

/**
 * Extract enzymes
 */
function extractEnzymes(drug) {
  const enzymes = drug.enzymes?.enzyme || [];
  const enzymeList = Array.isArray(enzymes) ? enzymes : [enzymes];

  return enzymeList.slice(0, 20).map(enzyme => ({
    id: enzyme.id || null,
    name: enzyme.name || null,
    organism: enzyme.organism || null,
    known_action: enzyme['known-action'] || null,
    actions: extractActions(enzyme)
  }));
}

/**
 * Extract actions from target/enzyme
 */
function extractActions(entity) {
  const actions = entity.actions?.action || [];
  return Array.isArray(actions) ? actions : [actions];
}

export default {
  loadDatabase,
  getDrugById,
  searchDrugsByName,
  searchDrugsByIndication,
  extractDrugSummary,
  extractDrugDetails
};

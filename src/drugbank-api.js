#!/usr/bin/env node

/**
 * DrugBank API
 *
 * Business logic layer for accessing DrugBank data
 * Implements all methods for the drugbank_info MCP tool
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if SQLite database exists, otherwise fall back to XML parser
const DB_FILE = path.join(__dirname, '..', 'data', 'drugbank.db');
const USE_SQLITE = fs.existsSync(DB_FILE);

let parser;
if (USE_SQLITE) {
  console.error('[DrugBank API] Using SQLite database (fast mode)');
  parser = await import('./drugbank-parser-sqlite.js');
} else {
  console.error('[DrugBank API] SQLite not found, using XML parser (slow mode)');
  console.error('[DrugBank API] Run "npm run build:db" to build SQLite database');
  parser = await import('./drugbank-parser.js');
}

/**
 * Handle drugbank_info tool requests
 * Main entry point for all methods
 */
export async function handleDrugBankInfo(params) {
  const { method } = params;

  try {
    switch (method) {
      case 'search_by_name':
        return await searchByName(params);

      case 'get_drug_details':
        return await getDrugDetails(params);

      case 'search_by_indication':
        return await searchByIndication(params);

      case 'search_by_target':
        return await searchByTarget(params);

      case 'get_drug_interactions':
        return await getDrugInteractions(params);

      case 'search_by_atc_code':
        return await searchByAtcCode(params);

      case 'get_pathways':
        return await getPathways(params);

      case 'search_by_structure':
        return await searchByStructure(params);

      case 'get_products':
        return await getProducts(params);

      case 'search_by_category':
        return await searchByCategory(params);

      case 'get_external_identifiers':
        return await getExternalIdentifiers(params);

      case 'search_by_halflife':
        return await searchByHalfLife(params);

      case 'get_similar_drugs':
        return await getSimilarDrugs(params);

      case 'search_by_carrier':
        return await searchByCarrier(params);

      case 'search_by_transporter':
        return await searchByTransporter(params);

      case 'get_salts':
        return await getSalts(params);

      default:
        return {
          error: `Unknown method: ${method}`,
          available_methods: [
            'search_by_name',
            'get_drug_details',
            'search_by_indication',
            'search_by_target',
            'get_drug_interactions',
            'search_by_atc_code',
            'get_pathways',
            'search_by_structure',
            'get_products',
            'search_by_category',
            'get_external_identifiers',
            'search_by_halflife',
            'get_similar_drugs',
            'search_by_carrier',
            'search_by_transporter',
            'get_salts'
          ]
        };
    }
  } catch (error) {
    console.error(`[DrugBank API] Error in ${method}:`, error);
    return {
      error: error.message,
      method: method
    };
  }
}

/**
 * Search drugs by name
 */
async function searchByName(params) {
  const { query, limit = 20 } = params;

  if (!query) {
    return { error: 'Missing required parameter: query' };
  }

  const drugs = await parser.searchDrugsByName(query, limit);
  const results = drugs.map(drug => parser.extractDrugSummary(drug));

  return {
    method: 'search_by_name',
    query: query,
    count: results.length,
    results: results
  };
}

/**
 * Get full drug details by DrugBank ID
 */
async function getDrugDetails(params) {
  const { drugbank_id } = params;

  if (!drugbank_id) {
    return { error: 'Missing required parameter: drugbank_id' };
  }

  const drug = await parser.getDrugById(drugbank_id);

  if (!drug) {
    return {
      error: `Drug not found: ${drugbank_id}`,
      drugbank_id: drugbank_id
    };
  }

  const details = parser.extractDrugDetails(drug);

  return {
    method: 'get_drug_details',
    drugbank_id: drugbank_id,
    drug: details
  };
}

/**
 * Search drugs by indication
 */
async function searchByIndication(params) {
  const { query, limit = 20 } = params;

  if (!query) {
    return { error: 'Missing required parameter: query' };
  }

  const drugs = await parser.searchDrugsByIndication(query, limit);
  const results = drugs.map(drug => parser.extractDrugSummary(drug));

  return {
    method: 'search_by_indication',
    query: query,
    count: results.length,
    results: results
  };
}

/**
 * Search drugs by target protein/enzyme
 */
async function searchByTarget(params) {
  const { target, limit = 20 } = params;

  if (!target) {
    return { error: 'Missing required parameter: target' };
  }

  const drugs = await parser.searchDrugsByTarget(target, limit);
  const results = drugs.map(drug => parser.extractDrugSummary(drug));

  return {
    method: 'search_by_target',
    target: target,
    count: results.length,
    results: results
  };
}

/**
 * Get drug interactions for a specific drug
 */
async function getDrugInteractions(params) {
  const { drugbank_id } = params;

  if (!drugbank_id) {
    return { error: 'Missing required parameter: drugbank_id' };
  }

  const drug = await parser.getDrugById(drugbank_id);

  if (!drug) {
    return {
      error: `Drug not found: ${drugbank_id}`,
      drugbank_id: drugbank_id
    };
  }

  const interactions = drug['drug-interactions']?.['drug-interaction'] || [];
  const interactionList = Array.isArray(interactions) ? interactions : [interactions];

  const results = interactionList.map(interaction => ({
    drugbank_id: interaction['drugbank-id'] || null,
    name: interaction.name || null,
    description: interaction.description || null
  }));

  return {
    method: 'get_drug_interactions',
    drugbank_id: drugbank_id,
    drug_name: drug.name || 'Unknown',
    interaction_count: results.length,
    interactions: results
  };
}

/**
 * Search drugs by ATC code
 */
async function searchByAtcCode(params) {
  const { code, limit = 20 } = params;

  if (!code) {
    return { error: 'Missing required parameter: code' };
  }

  const drugs = await parser.searchDrugsByAtcCode(code, limit);
  const results = drugs.map(drug => parser.extractDrugSummary(drug));

  return {
    method: 'search_by_atc_code',
    code: code,
    count: results.length,
    results: results
  };
}

/**
 * Get metabolic pathways for a drug
 */
async function getPathways(params) {
  const { drugbank_id } = params;

  if (!drugbank_id) {
    return { error: 'Missing required parameter: drugbank_id' };
  }

  const drug = await parser.getDrugById(drugbank_id);

  if (!drug) {
    return {
      error: `Drug not found: ${drugbank_id}`,
      drugbank_id: drugbank_id
    };
  }

  const pathways = drug.pathways?.pathway || [];
  const pathwayList = Array.isArray(pathways) ? pathways : [pathways];

  const results = pathwayList.map(pathway => ({
    smpdb_id: pathway['smpdb-id'] || null,
    name: pathway.name || null,
    category: pathway.category || null,
    drugs: extractPathwayDrugs(pathway),
    enzymes: extractPathwayEnzymes(pathway)
  }));

  return {
    method: 'get_pathways',
    drugbank_id: drugbank_id,
    drug_name: drug.name || 'Unknown',
    pathway_count: results.length,
    pathways: results
  };
}

/**
 * Extract pathway drugs
 */
function extractPathwayDrugs(pathway) {
  const drugs = pathway.drugs?.drug || [];
  const drugList = Array.isArray(drugs) ? drugs : [drugs];
  return drugList.map(d => ({
    drugbank_id: d['drugbank-id'] || null,
    name: d.name || null
  }));
}

/**
 * Extract pathway enzymes
 */
function extractPathwayEnzymes(pathway) {
  const enzymes = pathway.enzymes?.['uniprot-id'] || [];
  return Array.isArray(enzymes) ? enzymes : [enzymes];
}

/**
 * Search by chemical structure (SMILES/InChI)
 * Note: This is a simplified implementation
 * Real structure search would need chemical similarity algorithms
 */
async function searchByStructure(params) {
  const { smiles, inchi, limit = 20 } = params;

  if (!smiles && !inchi) {
    return { error: 'Missing required parameter: smiles or inchi' };
  }

  const drugs = await parser.searchDrugsByStructure(smiles, inchi, limit);
  const results = drugs.map(drug => parser.extractDrugSummary(drug));

  return {
    method: 'search_by_structure',
    query: smiles || inchi,
    count: results.length,
    results: results,
    note: 'This is an exact substring match. For true structure similarity search, consider using specialized chemical fingerprinting algorithms.'
  };
}

/**
 * Get market products for a drug
 */
async function getProducts(params) {
  const { drugbank_id, country } = params;

  if (!drugbank_id) {
    return { error: 'Missing required parameter: drugbank_id' };
  }

  const drug = await parser.getDrugById(drugbank_id);

  if (!drug) {
    return {
      error: `Drug not found: ${drugbank_id}`,
      drugbank_id: drugbank_id
    };
  }

  const products = drug.products?.product || [];
  const productList = Array.isArray(products) ? products : [products];

  // Filter by country if specified
  let filteredProducts = productList;
  if (country) {
    const countryLower = country.toLowerCase();
    filteredProducts = productList.filter(p =>
      p.country?.toLowerCase() === countryLower
    );
  }

  const results = filteredProducts.map(product => ({
    name: product.name || null,
    labeller: product.labeller || null,
    ndc_id: product['ndc-id'] || null,
    ndc_product_code: product['ndc-product-code'] || null,
    dpd_id: product['dpd-id'] || null,
    started_marketing_on: product['started-marketing-on'] || null,
    ended_marketing_on: product['ended-marketing-on'] || null,
    dosage_form: product['dosage-form'] || null,
    strength: product.strength || null,
    route: product.route || null,
    fda_application_number: product['fda-application-number'] || null,
    generic: product.generic || null,
    otc: product['over-the-counter'] || null,
    approved: product.approved || null,
    country: product.country || null,
    source: product.source || null
  }));

  return {
    method: 'get_products',
    drugbank_id: drugbank_id,
    drug_name: drug.name || 'Unknown',
    country_filter: country || 'all',
    product_count: results.length,
    products: results
  };
}

/**
 * Search drugs by category
 */
async function searchByCategory(params) {
  const { category, limit = 20 } = params;

  if (!category) {
    return { error: 'Missing required parameter: category' };
  }

  const drugs = await parser.searchDrugsByCategory(category, limit);
  const results = drugs.map(drug => parser.extractDrugSummary(drug));

  return {
    method: 'search_by_category',
    category: category,
    count: results.length,
    results: results
  };
}

/**
 * Get external identifiers for a drug (PubChem, ChEMBL, KEGG, UniProt, etc.)
 * Enables cross-database lookups and integration with other resources
 */
async function getExternalIdentifiers(params) {
  const { drugbank_id } = params;

  if (!drugbank_id) {
    return { error: 'Missing required parameter: drugbank_id' };
  }

  const drug = await parser.getDrugById(drugbank_id);

  if (!drug) {
    return {
      error: `Drug not found: ${drugbank_id}`,
      drugbank_id: drugbank_id
    };
  }

  // Extract external identifiers - already parsed as object from JSON
  const externalIds = drug.external_identifiers || drug['external-identifiers'] || {};

  // Also include calculated properties that contain structure identifiers
  const calcProps = drug.calculated_properties || drug['calculated-properties'] || {};

  // Extract structure identifiers from calculated properties
  const structureIds = {};
  if (calcProps.SMILES) structureIds.smiles = calcProps.SMILES;
  if (calcProps.InChI) structureIds.inchi = calcProps.InChI;
  if (calcProps.InChIKey) structureIds.inchi_key = calcProps.InChIKey;

  return {
    method: 'get_external_identifiers',
    drugbank_id: drugbank_id,
    drug_name: drug.name || 'Unknown',
    external_identifiers: externalIds,
    structure_identifiers: structureIds,
    all_drugbank_ids: drug.all_ids || []
  };
}

/**
 * Find drugs similar to a given drug
 * Uses Jaccard similarity on targets, categories, and ATC codes
 */
async function getSimilarDrugs(params) {
  const { drugbank_id, limit = 20 } = params;

  if (!drugbank_id) {
    return { error: 'Missing required parameter: drugbank_id' };
  }

  const refDrug = await parser.getDrugById(drugbank_id);
  if (!refDrug) {
    return {
      error: `Drug not found: ${drugbank_id}`,
      drugbank_id: drugbank_id
    };
  }

  const similarDrugs = await parser.findSimilarDrugs(drugbank_id, limit);

  const results = similarDrugs.map(item => ({
    drugbank_id: item.drug.drugbank_id,
    name: item.drug.name,
    similarity_score: item.similarity_score,
    target_similarity: item.target_similarity,
    category_similarity: item.category_similarity,
    atc_similarity: item.atc_similarity,
    shared_targets: item.shared_targets,
    shared_categories: item.shared_categories,
    groups: item.drug.groups || []
  }));

  return {
    method: 'get_similar_drugs',
    drugbank_id: drugbank_id,
    reference_drug: refDrug.name,
    count: results.length,
    note: 'Similarity based on shared targets (50%), categories (30%), and ATC codes (20%)',
    results: results
  };
}

/**
 * Search drugs by half-life range (in hours)
 * Allows finding drugs with specific elimination characteristics
 */
async function searchByHalfLife(params) {
  const { min_hours, max_hours, limit = 20 } = params;

  if (min_hours === undefined && max_hours === undefined) {
    return { error: 'At least one of min_hours or max_hours is required' };
  }

  const minVal = min_hours !== undefined ? parseFloat(min_hours) : null;
  const maxVal = max_hours !== undefined ? parseFloat(max_hours) : null;

  if (minVal !== null && isNaN(minVal)) {
    return { error: 'min_hours must be a valid number' };
  }
  if (maxVal !== null && isNaN(maxVal)) {
    return { error: 'max_hours must be a valid number' };
  }

  const drugs = await parser.searchDrugsByHalfLife(minVal, maxVal, limit);

  // Extract summary with half-life info
  const results = drugs.map(drug => {
    const summary = parser.extractDrugSummary(drug);
    return {
      ...summary,
      half_life: drug.half_life || null,
      half_life_hours: drug.half_life_hours || null
    };
  });

  return {
    method: 'search_by_halflife',
    min_hours: minVal,
    max_hours: maxVal,
    count: results.length,
    results: results
  };
}

/**
 * Search drugs by carrier protein
 * Carriers are proteins that transport drugs within the body
 */
async function searchByCarrier(params) {
  const { carrier, limit = 20 } = params;

  if (!carrier) {
    return { error: 'Missing required parameter: carrier' };
  }

  const results = await parser.searchDrugsByCarrier(carrier, limit);

  return {
    method: 'search_by_carrier',
    carrier: carrier,
    count: results.length,
    results: results
  };
}

/**
 * Search drugs by transporter protein
 * Transporters are membrane proteins that move drugs across cell membranes
 */
async function searchByTransporter(params) {
  const { transporter, limit = 20 } = params;

  if (!transporter) {
    return { error: 'Missing required parameter: transporter' };
  }

  const results = await parser.searchDrugsByTransporter(transporter, limit);

  return {
    method: 'search_by_transporter',
    transporter: transporter,
    count: results.length,
    results: results
  };
}

/**
 * Get salt forms for a drug
 * Salts are different chemical forms of a drug (e.g., hydrochloride, sulfate)
 */
async function getSalts(params) {
  const { drugbank_id } = params;

  if (!drugbank_id) {
    return { error: 'Missing required parameter: drugbank_id' };
  }

  const drug = await parser.getDrugById(drugbank_id);

  if (!drug) {
    return {
      error: `Drug not found: ${drugbank_id}`,
      drugbank_id: drugbank_id
    };
  }

  const salts = await parser.getDrugSalts(drugbank_id);

  return {
    method: 'get_salts',
    drugbank_id: drugbank_id,
    drug_name: drug.name || 'Unknown',
    salt_count: salts.length,
    salts: salts
  };
}

export default {
  handleDrugBankInfo
};

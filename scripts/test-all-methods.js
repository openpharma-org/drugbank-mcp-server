#!/usr/bin/env node

/**
 * Comprehensive test suite for all drugbank_info methods
 */

import { handleDrugBankInfo } from '../src/drugbank-api.js';

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('DrugBank MCP Server - Comprehensive Test Suite');
  console.log('='.repeat(60));
  console.log('');

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
      failed++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ============================================================
// 1. search_by_name
// ============================================================
test('search_by_name: finds drugs by name', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_name', query: 'aspirin', limit: 5 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
});

test('search_by_name: returns drug summaries with required fields', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_name', query: 'ibuprofen', limit: 1 });
  if (result.count > 0) {
    const drug = result.results[0];
    assert(drug.drugbank_id, 'Should have drugbank_id');
    assert(drug.name, 'Should have name');
  }
});

test('search_by_name: requires query parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_name' });
  assert(result.error, 'Should return error without query');
});

// ============================================================
// 2. get_drug_details
// ============================================================
test('get_drug_details: returns full drug info', async () => {
  const result = await handleDrugBankInfo({ method: 'get_drug_details', drugbank_id: 'DB00001' });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.drug, 'Should return drug object');
  assert(result.drug.drugbank_id === 'DB00001', 'Should match requested ID');
  assert(result.drug.name, 'Should have name');
});

test('get_drug_details: returns clinical info', async () => {
  const result = await handleDrugBankInfo({ method: 'get_drug_details', drugbank_id: 'DB00001' });
  const drug = result.drug;
  // Check for clinical fields (may be null but should exist)
  assert('indication' in drug, 'Should have indication field');
  assert('mechanism_of_action' in drug, 'Should have mechanism_of_action field');
  assert('pharmacodynamics' in drug, 'Should have pharmacodynamics field');
});

test('get_drug_details: handles non-existent drug', async () => {
  const result = await handleDrugBankInfo({ method: 'get_drug_details', drugbank_id: 'DB99999999' });
  assert(result.error, 'Should return error for non-existent drug');
});

test('get_drug_details: requires drugbank_id parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'get_drug_details' });
  assert(result.error, 'Should return error without drugbank_id');
});

// ============================================================
// 3. search_by_indication
// ============================================================
test('search_by_indication: finds drugs by indication', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_indication', query: 'pain', limit: 10 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
});

test('search_by_indication: requires query parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_indication' });
  assert(result.error, 'Should return error without query');
});

// ============================================================
// 4. search_by_target
// ============================================================
test('search_by_target: finds drugs by target protein', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_target', target: 'COX', limit: 10 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
});

test('search_by_target: requires target parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_target' });
  assert(result.error, 'Should return error without target');
});

// ============================================================
// 5. get_drug_interactions
// ============================================================
test('get_drug_interactions: returns interactions list', async () => {
  const result = await handleDrugBankInfo({ method: 'get_drug_interactions', drugbank_id: 'DB00001' });
  assert(!result.error, `Got error: ${result.error}`);
  assert('interaction_count' in result, 'Should have interaction_count');
  assert(Array.isArray(result.interactions), 'Should return interactions array');
});

test('get_drug_interactions: interaction has required fields', async () => {
  const result = await handleDrugBankInfo({ method: 'get_drug_interactions', drugbank_id: 'DB00001' });
  if (result.interactions.length > 0) {
    const interaction = result.interactions[0];
    assert('drugbank_id' in interaction, 'Interaction should have drugbank_id');
    assert('name' in interaction, 'Interaction should have name');
    assert('description' in interaction, 'Interaction should have description');
  }
});

test('get_drug_interactions: requires drugbank_id parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'get_drug_interactions' });
  assert(result.error, 'Should return error without drugbank_id');
});

// ============================================================
// 6. search_by_atc_code
// ============================================================
test('search_by_atc_code: finds drugs by ATC code', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_atc_code', code: 'N02', limit: 10 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
});

test('search_by_atc_code: requires code parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_atc_code' });
  assert(result.error, 'Should return error without code');
});

// ============================================================
// 7. get_pathways
// ============================================================
test('get_pathways: returns pathways for drug', async () => {
  const result = await handleDrugBankInfo({ method: 'get_pathways', drugbank_id: 'DB00001' });
  assert(!result.error, `Got error: ${result.error}`);
  assert('pathway_count' in result, 'Should have pathway_count');
  assert(Array.isArray(result.pathways), 'Should return pathways array');
});

test('get_pathways: requires drugbank_id parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'get_pathways' });
  assert(result.error, 'Should return error without drugbank_id');
});

// ============================================================
// 8. search_by_structure
// ============================================================
test('search_by_structure: finds drugs by SMILES', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_structure', smiles: 'CC', limit: 5 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
});

test('search_by_structure: requires smiles or inchi parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_structure' });
  assert(result.error, 'Should return error without smiles/inchi');
});

// ============================================================
// 9. get_products
// ============================================================
test('get_products: returns market products', async () => {
  const result = await handleDrugBankInfo({ method: 'get_products', drugbank_id: 'DB00001' });
  assert(!result.error, `Got error: ${result.error}`);
  assert('product_count' in result, 'Should have product_count');
  assert(Array.isArray(result.products), 'Should return products array');
});

test('get_products: filters by country', async () => {
  const result = await handleDrugBankInfo({ method: 'get_products', drugbank_id: 'DB00001', country: 'US' });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.country_filter === 'US', 'Should show country filter');
});

test('get_products: requires drugbank_id parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'get_products' });
  assert(result.error, 'Should return error without drugbank_id');
});

// ============================================================
// 10. search_by_category
// ============================================================
test('search_by_category: finds drugs by category', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_category', category: 'antibiotic', limit: 10 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
});

test('search_by_category: requires category parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_category' });
  assert(result.error, 'Should return error without category');
});

// ============================================================
// 11. get_external_identifiers (NEW)
// ============================================================
test('get_external_identifiers: returns cross-database IDs', async () => {
  const result = await handleDrugBankInfo({ method: 'get_external_identifiers', drugbank_id: 'DB00001' });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.external_identifiers, 'Should return external_identifiers');
  assert(result.structure_identifiers, 'Should return structure_identifiers');
  assert(result.drug_name, 'Should return drug_name');
});

test('get_external_identifiers: has multiple identifier sources', async () => {
  const result = await handleDrugBankInfo({ method: 'get_external_identifiers', drugbank_id: 'DB00001' });
  const ids = result.external_identifiers;
  const idCount = Object.keys(ids).length;
  assert(idCount >= 5, `Should have multiple identifiers, got ${idCount}`);
});

test('get_external_identifiers: includes common databases', async () => {
  const result = await handleDrugBankInfo({ method: 'get_external_identifiers', drugbank_id: 'DB00006' });
  const ids = result.external_identifiers;
  // DB00006 (Bivalirudin) should have PubChem and ChEMBL
  const hasCommonIds = ids['PubChem Compound'] || ids['PubChem Substance'] || ids['ChEMBL'];
  assert(hasCommonIds, 'Should have PubChem or ChEMBL identifiers');
});

test('get_external_identifiers: includes structure identifiers when available', async () => {
  const result = await handleDrugBankInfo({ method: 'get_external_identifiers', drugbank_id: 'DB00006' });
  const structIds = result.structure_identifiers;
  assert(structIds.smiles, 'Should have SMILES');
  assert(structIds.inchi, 'Should have InChI');
  assert(structIds.inchi_key, 'Should have InChIKey');
});

test('get_external_identifiers: requires drugbank_id parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'get_external_identifiers' });
  assert(result.error, 'Should return error without drugbank_id');
});

// ============================================================
// 12. search_by_halflife (NEW)
// ============================================================
test('search_by_halflife: finds drugs by half-life range', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_halflife', min_hours: 4, max_hours: 8, limit: 10 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
});

test('search_by_halflife: returns half_life_hours in results', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_halflife', min_hours: 4, max_hours: 8, limit: 5 });
  if (result.count > 0) {
    const drug = result.results[0];
    assert('half_life_hours' in drug, 'Should have half_life_hours');
    assert('half_life' in drug, 'Should have original half_life text');
    assert(drug.half_life_hours >= 4 && drug.half_life_hours <= 8, 'half_life_hours should be in range');
  }
});

test('search_by_halflife: works with only min_hours', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_halflife', min_hours: 100, limit: 5 });
  assert(!result.error, `Got error: ${result.error}`);
  if (result.count > 0) {
    assert(result.results[0].half_life_hours >= 100, 'Should respect min_hours');
  }
});

test('search_by_halflife: works with only max_hours', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_halflife', max_hours: 1, limit: 5 });
  assert(!result.error, `Got error: ${result.error}`);
  if (result.count > 0) {
    assert(result.results[0].half_life_hours <= 1, 'Should respect max_hours');
  }
});

test('search_by_halflife: requires at least one of min_hours or max_hours', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_halflife' });
  assert(result.error, 'Should return error without min_hours or max_hours');
});

// ============================================================
// 13. get_similar_drugs (NEW)
// ============================================================
test('get_similar_drugs: finds similar drugs', async () => {
  const result = await handleDrugBankInfo({ method: 'get_similar_drugs', drugbank_id: 'DB00006', limit: 10 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
  assert(result.reference_drug, 'Should include reference drug name');
});

test('get_similar_drugs: returns similarity scores', async () => {
  const result = await handleDrugBankInfo({ method: 'get_similar_drugs', drugbank_id: 'DB00006', limit: 5 });
  if (result.count > 0) {
    const similar = result.results[0];
    assert('similarity_score' in similar, 'Should have similarity_score');
    assert('target_similarity' in similar, 'Should have target_similarity');
    assert('category_similarity' in similar, 'Should have category_similarity');
    assert('atc_similarity' in similar, 'Should have atc_similarity');
    assert(similar.similarity_score >= 0 && similar.similarity_score <= 1, 'Score should be 0-1');
  }
});

test('get_similar_drugs: includes shared targets/categories', async () => {
  const result = await handleDrugBankInfo({ method: 'get_similar_drugs', drugbank_id: 'DB00006', limit: 5 });
  if (result.count > 0) {
    const similar = result.results[0];
    assert(Array.isArray(similar.shared_targets), 'Should have shared_targets array');
    assert(Array.isArray(similar.shared_categories), 'Should have shared_categories array');
  }
});

test('get_similar_drugs: requires drugbank_id parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'get_similar_drugs' });
  assert(result.error, 'Should return error without drugbank_id');
});

// ============================================================
// 14. search_by_carrier (NEW)
// ============================================================
test('search_by_carrier: finds drugs by carrier protein', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_carrier', carrier: 'Albumin', limit: 10 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
});

test('search_by_carrier: returns matched carrier info', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_carrier', carrier: 'Albumin', limit: 5 });
  if (result.count > 0) {
    const drug = result.results[0];
    assert(drug.matched_carrier, 'Should have matched_carrier');
    assert(drug.matched_carrier.name, 'matched_carrier should have name');
  }
});

test('search_by_carrier: requires carrier parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_carrier' });
  assert(result.error, 'Should return error without carrier');
});

// ============================================================
// 15. search_by_transporter (NEW)
// ============================================================
test('search_by_transporter: finds drugs by transporter protein', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_transporter', transporter: 'P-glycoprotein', limit: 10 });
  assert(!result.error, `Got error: ${result.error}`);
  assert(result.count >= 0, 'Should return count');
  assert(Array.isArray(result.results), 'Should return results array');
});

test('search_by_transporter: returns matched transporter info', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_transporter', transporter: 'P-glycoprotein', limit: 5 });
  if (result.count > 0) {
    const drug = result.results[0];
    assert(drug.matched_transporter, 'Should have matched_transporter');
    assert(drug.matched_transporter.name, 'matched_transporter should have name');
  }
});

test('search_by_transporter: requires transporter parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_transporter' });
  assert(result.error, 'Should return error without transporter');
});

// ============================================================
// 16. get_salts (NEW)
// ============================================================
test('get_salts: returns salt forms for drug', async () => {
  const result = await handleDrugBankInfo({ method: 'get_salts', drugbank_id: 'DB00001' });
  assert(!result.error, `Got error: ${result.error}`);
  assert('salt_count' in result, 'Should have salt_count');
  assert(Array.isArray(result.salts), 'Should return salts array');
  assert(result.drug_name, 'Should return drug_name');
});

test('get_salts: salt objects have expected fields', async () => {
  const result = await handleDrugBankInfo({ method: 'get_salts', drugbank_id: 'DB00001' });
  if (result.salt_count > 0) {
    const salt = result.salts[0];
    assert('name' in salt, 'Salt should have name');
    assert('unii' in salt, 'Salt should have unii');
    assert('cas_number' in salt, 'Salt should have cas_number');
  }
});

test('get_salts: requires drugbank_id parameter', async () => {
  const result = await handleDrugBankInfo({ method: 'get_salts' });
  assert(result.error, 'Should return error without drugbank_id');
});

// ============================================================
// Edge cases & Error handling
// ============================================================
test('unknown method: returns error with available methods', async () => {
  const result = await handleDrugBankInfo({ method: 'unknown_method' });
  assert(result.error, 'Should return error for unknown method');
  assert(result.available_methods, 'Should list available methods');
  assert(result.available_methods.length === 16, `Should have 16 methods, got ${result.available_methods.length}`);
});

test('limit parameter: respects limit', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_name', query: 'a', limit: 3 });
  assert(result.results.length <= 3, 'Should respect limit parameter');
});

// ============================================================
// Data quality checks
// ============================================================
test('data quality: database has expected drug count', async () => {
  // Search for a very common letter to get total-ish count
  const result = await handleDrugBankInfo({ method: 'search_by_category', category: 'a', limit: 1 });
  // Just verify it doesn't error - count check is in build
  assert(!result.error, 'Database should be queryable');
});

test('data quality: external identifiers are populated', async () => {
  const result = await handleDrugBankInfo({ method: 'get_external_identifiers', drugbank_id: 'DB00006' });
  const idCount = Object.keys(result.external_identifiers).length;
  assert(idCount >= 8, `DB00006 should have 8+ external identifiers, got ${idCount}`);
});

test('data quality: half-life parsing works', async () => {
  const result = await handleDrugBankInfo({ method: 'search_by_halflife', min_hours: 0.01, max_hours: 1000, limit: 5000 });
  assert(result.count > 1000, `Should have many drugs with parsed half-life, got ${result.count}`);
});

// Run all tests
runTests();

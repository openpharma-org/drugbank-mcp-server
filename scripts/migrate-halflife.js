#!/usr/bin/env node

/**
 * Migration script to add half_life_hours column to existing database
 * Parses freetext half_life values into normalized hours
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, '..', 'data', 'drugbank.db');

console.log('[Migration] Adding half_life_hours column...');

const db = new Database(DB_FILE);

// Check if column already exists
const tableInfo = db.prepare("PRAGMA table_info(drugs)").all();
const hasColumn = tableInfo.some(col => col.name === 'half_life_hours');

if (hasColumn) {
  console.log('[Migration] Column half_life_hours already exists, updating values...');
} else {
  console.log('[Migration] Adding half_life_hours column...');
  db.exec('ALTER TABLE drugs ADD COLUMN half_life_hours REAL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_half_life_hours ON drugs(half_life_hours)');
}

/**
 * Parse half-life text into hours (normalized)
 */
function parseHalfLifeToHours(halfLifeText) {
  if (!halfLifeText || typeof halfLifeText !== 'string') return null;

  const text = halfLifeText.toLowerCase().trim();

  const patterns = [
    // Range with hyphen: "4-5 hours", "11-12 min"
    /(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|min|days?|d|weeks?|wks?|w)/i,
    // With ± or plus/minus: "25 ± 10 hours"
    /(\d+(?:\.\d+)?)\s*[±\+\-\/]\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|min|days?|d|weeks?|wks?|w)/i,
    // Simple value with unit: "1.3 hours", "10 minutes"
    /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|min|days?|d|weeks?|wks?|w)/i,
    // Approximate: "approximately 10 minutes"
    /(?:approximately|about|~|circa|around)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|min|days?|d|weeks?|wks?|w)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let value;
      let unit = match[match.length - 1];

      if (match.length === 4) {
        const val1 = parseFloat(match[1]);
        const val2 = parseFloat(match[2]);
        value = (val1 + val2) / 2;
      } else {
        value = parseFloat(match[1]);
      }

      if (/^(minutes?|mins?|min)$/i.test(unit)) {
        return value / 60;
      } else if (/^(days?|d)$/i.test(unit)) {
        return value * 24;
      } else if (/^(weeks?|wks?|w)$/i.test(unit)) {
        return value * 24 * 7;
      } else {
        return value;
      }
    }
  }

  return null;
}

// Get all drugs with half_life data
const drugs = db.prepare('SELECT drugbank_id, half_life FROM drugs WHERE half_life IS NOT NULL').all();

console.log(`[Migration] Processing ${drugs.length} drugs with half-life data...`);

const updateStmt = db.prepare('UPDATE drugs SET half_life_hours = ? WHERE drugbank_id = ?');

let parsed = 0;
let failed = 0;

const updateAll = db.transaction(() => {
  for (const drug of drugs) {
    const hours = parseHalfLifeToHours(drug.half_life);
    if (hours !== null) {
      updateStmt.run(hours, drug.drugbank_id);
      parsed++;
    } else {
      failed++;
    }
  }
});

updateAll();

console.log(`[Migration] Successfully parsed: ${parsed}`);
console.log(`[Migration] Could not parse: ${failed}`);

// Show some examples
const examples = db.prepare(`
  SELECT drugbank_id, name, half_life, half_life_hours
  FROM drugs
  WHERE half_life_hours IS NOT NULL
  ORDER BY half_life_hours ASC
  LIMIT 10
`).all();

console.log('\n[Migration] Sample results (shortest half-lives):');
for (const ex of examples) {
  console.log(`  ${ex.name}: ${ex.half_life_hours.toFixed(2)} hours`);
}

db.close();
console.log('\n[Migration] Done!');

#!/usr/bin/env node

/**
 * Build script for drugbank-mcp-server
 *
 * Copies source files from src/ to build/ folder
 * Simple copy operation since we're staying with JS (no transpilation needed)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const buildDir = path.join(rootDir, 'build');

console.log('[Build] Starting build process...');

// Clean build directory
if (fs.existsSync(buildDir)) {
  console.log('[Build] Cleaning build directory...');
  fs.rmSync(buildDir, { recursive: true });
}

// Create build directory
console.log('[Build] Creating build directory...');
fs.mkdirSync(buildDir, { recursive: true });

// Copy all JS files from src to build
console.log('[Build] Copying source files...');

function copyFiles(srcPath, destPath) {
  const entries = fs.readdirSync(srcPath, { withFileTypes: true });

  for (const entry of entries) {
    const srcFile = path.join(srcPath, entry.name);
    const destFile = path.join(destPath, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destFile, { recursive: true });
      copyFiles(srcFile, destFile);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      fs.copyFileSync(srcFile, destFile);
      console.log(`[Build]   ✓ ${entry.name}`);
    }
  }
}

copyFiles(srcDir, buildDir);

console.log('[Build] Build complete!');
console.log(`[Build] Output: ${buildDir}`);

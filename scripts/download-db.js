#!/usr/bin/env node

/**
 * Download pre-built DrugBank database from GitHub Releases
 *
 * This script downloads the latest SQLite database from GitHub Releases,
 * eliminating the need to download and process the 1.5GB XML file locally.
 *
 * Usage:
 *   node scripts/download-db.js [version]
 *
 * Examples:
 *   node scripts/download-db.js              # Download latest release
 *   node scripts/download-db.js db-2025-01-15 # Download specific version
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO = 'openpharma-org/drugbank-mcp-server';
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'drugbank.db');

async function getLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      headers: {
        'User-Agent': 'DrugBank-MCP-Server'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = ((downloaded / totalSize) * 100).toFixed(1);
        process.stdout.write(`\rDownloading: ${percent}%`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\n✓ Download complete!');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destination, () => {});
      reject(err);
    });
  });
}

async function main() {
  const specificVersion = process.argv[2];

  try {
    console.log('[DrugBank DB Downloader]');
    console.log('Repository:', REPO);
    console.log();

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      console.log('Creating data directory...');
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    let downloadUrl;

    if (specificVersion) {
      console.log('Fetching specific version:', specificVersion);
      downloadUrl = `https://github.com/${REPO}/releases/download/${specificVersion}/drugbank.db`;
    } else {
      console.log('Fetching latest release...');
      const release = await getLatestRelease();
      const asset = release.assets.find(a => a.name === 'drugbank.db');

      if (!asset) {
        throw new Error('Database file not found in latest release');
      }

      console.log('Latest version:', release.tag_name);
      console.log('Published:', new Date(release.published_at).toLocaleDateString());
      console.log('Size:', (asset.size / (1024 * 1024)).toFixed(1), 'MB');
      console.log();

      downloadUrl = asset.browser_download_url;
    }

    // Check if file already exists
    if (fs.existsSync(DB_FILE)) {
      console.log('⚠️  Database file already exists at:', DB_FILE);
      console.log('Delete it first if you want to re-download');
      process.exit(1);
    }

    console.log('Downloading database...');
    await downloadFile(downloadUrl, DB_FILE);

    // Verify the database
    console.log('Verifying database...');
    const stats = fs.statSync(DB_FILE);
    console.log('File size:', (stats.size / (1024 * 1024)).toFixed(1), 'MB');
    console.log();
    console.log('✓ Database ready at:', DB_FILE);
    console.log();
    console.log('Next steps:');
    console.log('  npm run build:code    # Copy source to build/');
    console.log('  npm start             # Start the MCP server');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

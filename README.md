# Unofficial DrugBank MCP Server

Model Context Protocol (MCP) server providing access to the comprehensive DrugBank pharmaceutical database (17,430+ drugs).

## Features

- **Single unified tool** (`drugbank_info`) with 16 methods
- **High-performance SQLite backend**: <10ms queries, ~50-100MB memory usage
- Access to 17,430 drug records (13,166 small molecules + 4,264 biotech)
- Comprehensive pharmaceutical data including:
  - Drug names, descriptions, classifications
  - Clinical indications and mechanisms of action
  - Chemical structures (SMILES, InChI)
  - Drug interactions and contraindications
  - Target proteins, enzymes, carriers, transporters
  - Metabolic pathways
  - Market products and regulatory information
  - Pharmacokinetics (half-life search) and toxicity data
  - Salt forms and external database identifiers
  - Drug similarity search

## Installation

```bash
# Clone and install dependencies
cd drugbank-mcp-server
npm install

# Download pre-built SQLite database from latest GitHub release
npm run download:db

# Build the project (copies src/ to build/)
npm run build:code
```

### Database Versioning

The database version is tracked in `data/VERSION` and automatically updated monthly:
- **Current version**: 5.1 (see `data/VERSION`)
- **Automated updates**: Monthly via GitHub Actions (1st of each month)
- **Manual updates**: Run `npm run download:db` to get the latest release
- **GitHub releases**: Each database update creates a new release with the database file

The workflow automatically:
1. Downloads the latest DrugBank XML
2. Extracts the version from the XML header
3. Compares with the tracked version in `data/VERSION`
4. Only builds and releases if the version changed or release is missing
5. Updates `data/VERSION` and commits to the repository

## Usage 

```json
{
  "mcpServers": {
    "drugbank": {
      "command": "node",
      "args": ["/Users/joan.saez-pons/code/drugbank-mcp-server/build/index.js"]
    }
  }
}
```

## Tool: drugbank_info

Single unified tool with multiple methods accessed via the `method` parameter.

### Methods

#### 1. search_by_name
Search drugs by name (supports partial matching).

**Note**: DrugBank uses chemical names as primary identifiers. Search for "Acetylsalicylic" to find aspirin, "Ibuprofen" not "Advil", etc.

```json
{
  "method": "search_by_name",
  "query": "Acetylsalicylic",
  "limit": 20
}
```

#### 2. get_drug_details
Get complete drug information by DrugBank ID.

```json
{
  "method": "get_drug_details",
  "drugbank_id": "EXPT00475"
}
```

Returns full drug record including:
- All identifiers (DrugBank ID, CAS, UNII)
- Clinical information (indication, mechanism, toxicity)
- Pharmacokinetics (absorption, metabolism, half-life)
- Chemical properties
- Interactions (drug-drug, food)
- Targets and enzymes

#### 3. search_by_indication
Find drugs by medical indication.

```json
{
  "method": "search_by_indication",
  "query": "pain",
  "limit": 20
}
```

#### 4. search_by_target
Find drugs by target protein/enzyme.

```json
{
  "method": "search_by_target",
  "target": "COX-2",
  "limit": 20
}
```

#### 5. get_drug_interactions
Get all drug-drug interactions for a specific drug.

```json
{
  "method": "get_drug_interactions",
  "drugbank_id": "DB00945"
}
```

#### 6. search_by_atc_code
Search by ATC (Anatomical Therapeutic Chemical) classification code.

```json
{
  "method": "search_by_atc_code",
  "code": "N02BA",
  "limit": 20
}
```

#### 7. get_pathways
Get metabolic pathways for a drug.

```json
{
  "method": "get_pathways",
  "drugbank_id": "DB00945"
}
```

#### 8. search_by_structure
Search by chemical structure (SMILES or InChI).

```json
{
  "method": "search_by_structure",
  "smiles": "CC(=O)Oc1ccccc1C(=O)O",
  "limit": 20
}
```

#### 9. get_products
Get market products for a drug (brand names, manufacturers).

```json
{
  "method": "get_products",
  "drugbank_id": "DB00945",
  "country": "US"
}
```

#### 10. search_by_category
Search drugs by therapeutic category.

```json
{
  "method": "search_by_category",
  "category": "Anti-inflammatory",
  "limit": 20
}
```

#### 11. get_external_identifiers
Get cross-database identifiers (PubChem, ChEMBL, KEGG, RxCUI, etc.) and structure identifiers.

```json
{
  "method": "get_external_identifiers",
  "drugbank_id": "DB02351"
}
```

#### 12. search_by_halflife
Find drugs by elimination half-life range (in hours). Useful for dosing considerations.

```json
{
  "method": "search_by_halflife",
  "min_hours": 12,
  "max_hours": 48,
  "limit": 20
}
```

#### 13. get_similar_drugs
Find drugs similar to a reference drug based on shared targets, categories, and ATC codes. Uses Jaccard similarity scoring.

```json
{
  "method": "get_similar_drugs",
  "drugbank_id": "APRD00003",
  "limit": 20
}
```

Returns similarity scores with breakdown by:
- **target_similarity**: Shared protein/enzyme targets (50% weight)
- **category_similarity**: Shared therapeutic categories (30% weight)
- **atc_similarity**: Shared ATC classification codes (20% weight)

#### 14. search_by_carrier
Find drugs by carrier protein (proteins that transport drugs in the body, like albumin).

```json
{
  "method": "search_by_carrier",
  "carrier": "Albumin",
  "limit": 20
}
```

#### 15. search_by_transporter
Find drugs by transporter protein (membrane proteins that move drugs across cell membranes).

```json
{
  "method": "search_by_transporter",
  "transporter": "P-glycoprotein",
  "limit": 20
}
```

#### 16. get_salts
Get salt forms for a drug (different chemical forms like hydrochloride, sulfate).

```json
{
  "method": "get_salts",
  "drugbank_id": "DB00007"
}
```

## Example Queries with Claude

Once configured, you can ask Claude:

- "Find information about acetylsalicylic acid using DrugBank" (aspirin's chemical name)
- "Search DrugBank for drugs containing ibuprofen"
- "What drugs interact with warfarin?"
- "Show me all drugs that target COX-2"
- "Find drugs used for treating hypertension"
- "What are the metabolic pathways for acetylsalicylic acid?"
- "Find drugs similar to Nelfinavir" (HIV protease inhibitor)
- "What are the external identifiers for Bivalirudin?"
- "Find drugs with a half-life between 12 and 24 hours"
- "What drugs are carried by albumin?"
- "Find drugs transported by P-glycoprotein"
- "What salt forms are available for leuprolide?"

**Note**: Use chemical/generic names (acetylsalicylic acid, ibuprofen, acetaminophen) rather than brand names (Aspirin, Advil, Tylenol) for best results.

## Architecture

```
src/
├── index.js                    # MCP server (unified tool pattern)
├── drugbank-api.js             # Business logic (16 methods)
├── drugbank-parser-sqlite.js   # SQLite query layer (fast)
└── drugbank-parser.js          # XML fallback parser (slow)

build/                          # Built files (copied from src/)
├── index.js
├── drugbank-api.js
├── drugbank-parser-sqlite.js
└── drugbank-parser.js

data/                           # Database files
├── VERSION                     # Tracked version (e.g., "5.1")
└── drugbank.db                 # SQLite database (31MB, gitignored)

scripts/
├── build.js                    # Copy src/ to build/
├── build-db.js                 # Build SQLite from XML (includes half-life parsing)
├── download-db.js              # Download pre-built database from GitHub releases
└── migrate-halflife.js         # Migration script for half_life_hours column

.github/workflows/
└── update-database.yml         # Automated monthly database updates
```

**Pattern**: Single unified tool with method enum (following who-mcp-server, sec-mcp-server, cdc-mcp-server patterns)

**Database Backend**: Auto-detects SQLite (fast) or falls back to XML parser (slow)

## Performance

### SQLite Mode (Default)
- **All queries**: <10ms
- **Memory usage**: ~50-100MB
- **Database size**: 31.1MB (98% reduction from 1.5GB XML)
- **FTS5 full-text search**: Fast name/indication lookups

### XML Fallback Mode
- **First query**: ~30-60 seconds (loads entire 1.5GB XML into memory)
- **Subsequent queries**: <500ms (cached in memory)
- **Memory usage**: ~2-3GB when database is loaded

## Data Source

- **Database**: DrugBank (Full Database)
- **Current version**: 5.1 (see `data/VERSION`)
- **Records**: 17,430 drugs (13,166 small molecules + 4,264 biotech)
- **Updates**: Automated monthly via GitHub Actions (1st of each month)
- **Download**: Pre-built databases available in [GitHub Releases](../../releases)

## Development

```bash
# Run server in development mode (directly from src/)
npm run dev

# Build for production
npm run build

# Run built server
npm start

# The server uses stdio transport for MCP communication
# Logs go to stderr, MCP responses go to stdout
```

## Troubleshooting

**Server not appearing in Claude Desktop:**
- Check that the path in `claude_desktop_config.json` is correct
- Restart Claude Desktop completely
- Check Claude Desktop logs for errors

**Database not found:**
- Run `npm run download:db` to download the latest pre-built SQLite database from GitHub releases
- Database file should be at `data/drugbank.db`
- Check current version: `cat data/VERSION`

**Check for database updates:**
- Current version is tracked in `data/VERSION`
- Latest releases are available at [GitHub Releases](../../releases)
- Run `npm run download:db` to get the latest version
- Database is automatically updated monthly (1st of each month)

## License

MIT
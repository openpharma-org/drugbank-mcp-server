# Unofficial DrugBank MCP Server

Model Context Protocol (MCP) server providing access to the comprehensive DrugBank pharmaceutical database (17,430+ drugs).

## Features

- **Single unified tool** (`drugbank_info`) with 10 methods
- **High-performance SQLite backend**: <10ms queries, ~50-100MB memory usage
- Access to 17,430 drug records (13,166 small molecules + 4,264 biotech)
- Comprehensive pharmaceutical data including:
  - Drug names, descriptions, classifications
  - Clinical indications and mechanisms of action
  - Chemical structures (SMILES, InChI)
  - Drug interactions and contraindications
  - Target proteins, enzymes, carriers
  - Metabolic pathways
  - Market products and regulatory information
  - Pharmacokinetics and toxicity data

## Installation

```bash
# Clone and install dependencies
cd drugbank-mcp-server
npm install

# Download pre-built SQLite database (31MB)
npm run download:db

# Build the project (copies src/ to build/)
npm run build:code
```

**Alternative**: Build database from DrugBank XML (requires DrugBank account):
```bash
# Place "full database.xml" in data/ folder, then:
npm run build:db
```

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

## Example Queries with Claude

Once configured, you can ask Claude:

- "Find information about acetylsalicylic acid using DrugBank" (aspirin's chemical name)
- "Search DrugBank for drugs containing ibuprofen"
- "What drugs interact with warfarin?"
- "Show me all drugs that target COX-2"
- "Find drugs used for treating hypertension"
- "What are the metabolic pathways for acetylsalicylic acid?"

**Note**: Use chemical/generic names (acetylsalicylic acid, ibuprofen, acetaminophen) rather than brand names (Aspirin, Advil, Tylenol) for best results.

## Architecture

```
src/
├── index.js                    # MCP server (unified tool pattern)
├── drugbank-api.js             # Business logic (10 methods)
├── drugbank-parser-sqlite.js   # SQLite query layer (fast)
└── drugbank-parser.js          # XML fallback parser (slow)

build/                          # Built files (copied from src/)
├── index.js
├── drugbank-api.js
├── drugbank-parser-sqlite.js
└── drugbank-parser.js

data/                           # Database files (gitignored)
└── drugbank.db                 # SQLite database (31MB)

scripts/
├── build.js                    # Copy src/ to build/
├── build-db.js                 # Build SQLite from XML
└── download-db.js              # Download pre-built database

.github/workflows/
└── update-database.yml         # Automated quarterly updates
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
- **Records**: 17,430 drugs (13,166 small molecules + 4,264 biotech)
- **Updates**: Automated quarterly via GitHub Actions
- **Source size**: 1.5GB XML → 31.1MB SQLite

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

## Automated Database Updates (for Maintainers)

GitHub Actions automatically checks for updates monthly:

1. **Set GitHub Secrets** (in repository settings):
   - `DRUGBANK_USERNAME`: Your DrugBank account username
   - `DRUGBANK_PASSWORD`: Your DrugBank account password

2. **Manual Trigger**: Go to Actions → "Update DrugBank Database" → Run workflow

3. **How it works**:
   - Checks DrugBank releases page for new version (no download)
   - If new version detected:
     - Downloads latest DrugBank XML
     - Builds SQLite database
     - Validates drug count (>15,000)
     - Publishes to GitHub Releases
   - If no change: skips build (saves time/bandwidth)

## Troubleshooting

**Server not appearing in Claude Desktop:**
- Check that the path in `claude_desktop_config.json` is correct
- Restart Claude Desktop completely
- Check Claude Desktop logs for errors

**Database not found:**
- Run `npm run download:db` to download pre-built SQLite database
- Or place `full database.xml` in `data/` folder and run `npm run build:db`
- Database file should be at `data/drugbank.db`

**Slow queries (>1 second):**
- Check if SQLite database exists at `data/drugbank.db`
- If using XML fallback mode, first query takes 30-60s (server will log mode on startup)
- SQLite mode provides <10ms queries

## License

MIT

## Credits

Built following MCP patterns from:
- who-mcp-server
- sec-mcp-server
- cdc-mcp-server

Data source: DrugBank (https://go.drugbank.com/)

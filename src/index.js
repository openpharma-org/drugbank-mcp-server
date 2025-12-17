#!/usr/bin/env node

/**
 * DrugBank MCP Server
 *
 * Model Context Protocol server providing access to DrugBank pharmaceutical database
 * Implements a single unified tool: drugbank_info with multiple methods
 *
 * Based on patterns from who-mcp-server, sec-mcp-server, and cdc-mcp-server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { handleDrugBankInfo } from './drugbank-api.js';

/**
 * MCP Server instance
 */
const server = new Server(
  {
    name: 'drugbank-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Tool definition: drugbank_info
 * Single unified tool with multiple methods
 */
const DRUGBANK_INFO_TOOL = {
  name: 'drugbank_info',
  description: `Access comprehensive pharmaceutical data from DrugBank database (13,000+ drugs).

Available methods:

1. search_by_name - Search drugs by name (fuzzy matching)
   Parameters: query (required), limit (optional, default: 20)
   Example: { "method": "search_by_name", "query": "aspirin" }

2. get_drug_details - Get complete drug information by DrugBank ID
   Parameters: drugbank_id (required)
   Example: { "method": "get_drug_details", "drugbank_id": "DB00945" }

3. search_by_indication - Find drugs by medical indication
   Parameters: query (required), limit (optional, default: 20)
   Example: { "method": "search_by_indication", "query": "pain" }

4. search_by_target - Find drugs by target protein/enzyme
   Parameters: target (required), limit (optional, default: 20)
   Example: { "method": "search_by_target", "target": "COX-2" }

5. get_drug_interactions - Get drug-drug interactions
   Parameters: drugbank_id (required)
   Example: { "method": "get_drug_interactions", "drugbank_id": "DB00945" }

6. search_by_atc_code - Search by ATC classification code
   Parameters: code (required), limit (optional, default: 20)
   Example: { "method": "search_by_atc_code", "code": "N02BA" }

7. get_pathways - Get metabolic pathways for a drug
   Parameters: drugbank_id (required)
   Example: { "method": "get_pathways", "drugbank_id": "DB00945" }

8. search_by_structure - Search by chemical structure (SMILES/InChI)
   Parameters: smiles or inchi (required), limit (optional, default: 20)
   Example: { "method": "search_by_structure", "smiles": "CC(=O)Oc1ccccc1C(=O)O" }

9. get_products - Get market products for a drug
   Parameters: drugbank_id (required), country (optional)
   Example: { "method": "get_products", "drugbank_id": "DB00945", "country": "US" }

10. search_by_category - Search drugs by category
    Parameters: category (required), limit (optional, default: 20)
    Example: { "method": "search_by_category", "category": "Anti-inflammatory" }`,
  inputSchema: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        enum: [
          'search_by_name',
          'get_drug_details',
          'search_by_indication',
          'search_by_target',
          'get_drug_interactions',
          'search_by_atc_code',
          'get_pathways',
          'search_by_structure',
          'get_products',
          'search_by_category'
        ],
        description: 'Method to execute'
      },
      query: {
        type: 'string',
        description: 'Search query (for search_by_name, search_by_indication)'
      },
      drugbank_id: {
        type: 'string',
        description: 'DrugBank ID (e.g., DB00945) - for get_drug_details, get_drug_interactions, get_pathways, get_products'
      },
      target: {
        type: 'string',
        description: 'Target protein/enzyme name (for search_by_target)'
      },
      code: {
        type: 'string',
        description: 'ATC classification code (for search_by_atc_code)'
      },
      smiles: {
        type: 'string',
        description: 'SMILES notation (for search_by_structure)'
      },
      inchi: {
        type: 'string',
        description: 'InChI notation (for search_by_structure)'
      },
      category: {
        type: 'string',
        description: 'Drug category name (for search_by_category)'
      },
      country: {
        type: 'string',
        description: 'Country code (optional, for get_products)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 20)',
        default: 20
      }
    },
    required: ['method'],
    additionalProperties: false
  }
};

/**
 * Handler: List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [DRUGBANK_INFO_TOOL]
  };
});

/**
 * Handler: Execute tool
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'drugbank_info') {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    console.error(`[DrugBank MCP] Executing ${args.method}`);
    const startTime = Date.now();

    const result = await handleDrugBankInfo(args);

    const duration = Date.now() - startTime;
    console.error(`[DrugBank MCP] Completed ${args.method} in ${duration}ms`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('[DrugBank MCP] Error:', error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            tool: name,
            arguments: args
          }, null, 2)
        }
      ],
      isError: true
    };
  }
});

/**
 * Start server
 */
async function main() {
  console.error('[DrugBank MCP] Starting server...');
  console.error('[DrugBank MCP] Database will load on first query');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[DrugBank MCP] Server ready');
}

main().catch((error) => {
  console.error('[DrugBank MCP] Fatal error:', error);
  process.exit(1);
});

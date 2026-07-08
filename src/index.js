#!/usr/bin/env node
// fallmage-mcp · stdio MCP server exposing fallmage-sdk to any MCP client.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {
  PRESETS, FILTERS, FONTS, TOOLS,
  newDoc, addImageLayer, addTextLayer, applyCrop,
  omegaRoute, OMEGA_SYSTEM_PROMPT, parseOmegaJson,
  defaultAdjust, adjustToFilter, VERSION
} from '@ai-native-solutions/fallmage-sdk';

const server = new Server(
  { name: 'fallmage-mcp', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// ── tools ──
const TOOL_DEFS = [
  {
    name: 'omega_route',
    description: 'Route a natural-language image-editing intent (e.g. "make it pop", "instagram square", "caption: launch day", "crop to 800x600") to a structured action. Local — no LLM required.',
    inputSchema: {
      type: 'object',
      required: ['intent'],
      properties: { intent: { type: 'string', description: 'Free-text description of the desired action.' } }
    }
  },
  {
    name: 'list_presets',
    description: 'List all 11 canvas size presets (Instagram, Twitter, LinkedIn, YouTube, A4, TikTok, business card, ...).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_filters',
    description: 'List all 9 filter presets (vintage, noir, pop, warm, cool, fade, invert, mono, dream) with their adjust values.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'plan_document',
    description: 'Build a fallmage document plan (dimensions, background, layers, adjust) that a browser or Node renderer can execute. Accepts a preset name OR explicit width/height.',
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', description: 'Preset name from list_presets. Overrides width/height if set.' },
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
        background: { type: 'string', default: '#ffffff', description: 'Hex background colour.' },
        filter: { type: 'string', description: 'Name of a filter preset to apply to the document adjust.' },
        text: { type: 'string', description: 'Caption text — added as a centred text layer.' },
        text_size: { type: 'integer', default: 64 },
        text_color: { type: 'string', default: '#ffffff' },
        text_font: { type: 'string', default: 'Georgia' }
      }
    }
  },
  {
    name: 'adjust_to_css_filter',
    description: 'Serialize an adjust object (brightness/contrast/saturate/hue/blur/sepia/grayscale/invert) into a browser CSS `filter` string.',
    inputSchema: {
      type: 'object',
      required: ['adjust'],
      properties: {
        adjust: {
          type: 'object',
          properties: {
            brightness: { type: 'number' }, contrast: { type: 'number' },
            saturate:   { type: 'number' }, hue:      { type: 'number' },
            blur:       { type: 'number' }, sepia:    { type: 'number' },
            grayscale:  { type: 'number' }, invert:   { type: 'number' }
          }
        }
      }
    }
  },
  {
    name: 'omega_prompt',
    description: 'Return the Ω system prompt + user intent so a caller can feed it to any LLM. Also returns a parser helper hint. Use when the local omega_route returns action:"none".',
    inputSchema: {
      type: 'object', required: ['intent'],
      properties: { intent: { type: 'string' } }
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

  if (name === 'omega_route') return ok(omegaRoute(args.intent || ''));

  if (name === 'list_presets') return ok({ presets: PRESETS, count: Object.keys(PRESETS).length });

  if (name === 'list_filters') return ok({ filters: FILTERS, count: Object.keys(FILTERS).length });

  if (name === 'plan_document') {
    let w = args.width, h = args.height;
    if (args.preset && PRESETS[args.preset]) { w = PRESETS[args.preset].w; h = PRESETS[args.preset].h; }
    if (!w || !h) { w = 1080; h = 1080; }
    const doc = newDoc(w, h, args.background || '#ffffff');
    if (args.filter && FILTERS[args.filter]) doc.adjust = { ...FILTERS[args.filter] };
    if (args.text) {
      addTextLayer(doc, {
        text: args.text,
        size: args.text_size || 64,
        color: args.text_color || '#ffffff',
        font:  args.text_font  || 'Georgia'
      });
    }
    // strip non-serializable img references (none here since no image layers)
    return ok({ doc, css_filter: adjustToFilter(doc.adjust) });
  }

  if (name === 'adjust_to_css_filter') {
    const a = { ...defaultAdjust(), ...(args.adjust || {}) };
    return ok({ filter: adjustToFilter(a), adjust: a });
  }

  if (name === 'omega_prompt') {
    return ok({
      system: OMEGA_SYSTEM_PROMPT,
      user: args.intent || '',
      parser_hint: 'Feed the LLM response through parseOmegaJson (grabs first {...} block, JSON.parses).'
    });
  }

  return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
});

// ── resources ──
const RESOURCES = [
  { uri: 'fallmage://presets',  name: 'Canvas presets',  description: '11 canvas size presets.', mimeType: 'application/json' },
  { uri: 'fallmage://filters',  name: 'Filter library',  description: '9 filter presets with adjust values.', mimeType: 'application/json' },
  { uri: 'fallmage://fonts',    name: 'Fonts + tools',   description: 'Supported fonts, weights, tool names.', mimeType: 'application/json' },
  { uri: 'fallmage://omega',    name: 'Ω system prompt', description: 'System prompt for the LLM autopilot fallback.', mimeType: 'text/plain' }
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  const asJson = (obj) => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(obj, null, 2) }] });
  const asText = (s)   => ({ contents: [{ uri, mimeType: 'text/plain',        text: s }] });

  if (uri === 'fallmage://presets') return asJson({ presets: PRESETS });
  if (uri === 'fallmage://filters') return asJson({ filters: FILTERS });
  if (uri === 'fallmage://fonts')   return asJson({ fonts: FONTS, tools: TOOLS });
  if (uri === 'fallmage://omega')   return asText(OMEGA_SYSTEM_PROMPT);
  throw new Error(`unknown resource: ${uri}`);
});

// ── boot ──
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`fallmage-mcp v${VERSION} · stdio · 6 tools · 4 resources · ready`);

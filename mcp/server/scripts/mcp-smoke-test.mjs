#!/usr/bin/env node
/**
 * PsyMetric MCP server smoke test.
 *
 * What this tests:
 * - MCP stdio server starts
 * - tools/list works
 * - tools/call works for list_projects
 * - tools/call works for search_entities (limit=1) if backend has entities
 *
 * Prereqs:
 * - PsyMetric backend running and reachable at PSYMETRIC_BASE_URL
 * - Env vars set: PSYMETRIC_BASE_URL and exactly one of PSYMETRIC_PROJECT_ID or PSYMETRIC_PROJECT_SLUG
 */

import { spawn } from "node:child_process";

const BASE_URL = process.env.PSYMETRIC_BASE_URL;
const PROJECT_ID = process.env.PSYMETRIC_PROJECT_ID;
const PROJECT_SLUG = process.env.PSYMETRIC_PROJECT_SLUG;

if (!BASE_URL) {
  console.error("Missing PSYMETRIC_BASE_URL");
  process.exit(1);
}
if ((PROJECT_ID && PROJECT_SLUG) || (!PROJECT_ID && !PROJECT_SLUG)) {
  console.error("Set exactly one of PSYMETRIC_PROJECT_ID or PSYMETRIC_PROJECT_SLUG");
  process.exit(1);
}

function send(proc, msg) {
  proc.stdin.write(JSON.stringify(msg) + "\n");
}

function waitFor(proc, id, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for id=${id}`)), timeoutMs);
    const onMessage = (obj) => {
      if (obj && obj.id === id) {
        clearTimeout(timer);
        proc.off("mcpMessage", onMessage);
        resolve(obj);
      }
    };
    proc.on("mcpMessage", onMessage);
  });
}

function parseJsonLines(proc) {
  let buf = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    buf += chunk;
    while (true) {
      const idx = buf.indexOf("\n");
      if (idx === -1) break;
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        proc.emit("mcpMessage", obj);
      } catch (e) {
        // Ignore non-JSON output on stdout; MCP server should keep logs on stderr.
      }
    }
  });
}

async function main() {
  const proc = spawn("node", ["dist/index.js"], {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      PSYMETRIC_BASE_URL: BASE_URL,
      PSYMETRIC_PROJECT_ID: PROJECT_ID ?? "",
      PSYMETRIC_PROJECT_SLUG: PROJECT_SLUG ?? "",
    },
  });

  parseJsonLines(proc);

  // 1) initialize (minimal handshake)
  send(proc, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "psymetric-mcp-smoke", version: "0.0.1" },
    },
  });
  const initResp = await waitFor(proc, 1);
  if (initResp.error) throw new Error(`initialize failed: ${JSON.stringify(initResp.error)}`);

  // 2) tools/list
  send(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const listResp = await waitFor(proc, 2);
  if (listResp.error) throw new Error(`tools/list failed: ${JSON.stringify(listResp.error)}`);
  const tools = listResp.result?.tools ?? [];
  const names = new Set(tools.map((t) => t.name));
  const required = [
    "list_projects",
    "search_entities",
    "get_entity",
    "get_entity_graph",
    "list_search_performance",
    "list_quotable_blocks",
  ];
  for (const n of required) {
    if (!names.has(n)) throw new Error(`Missing tool: ${n}`);
  }

  // 3) tools/call list_projects
  send(proc, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "list_projects", arguments: { page: 1, limit: 5 } },
  });
  const projectsResp = await waitFor(proc, 3);
  if (projectsResp.error) throw new Error(`list_projects failed: ${JSON.stringify(projectsResp.error)}`);

  // 4) tools/call search_entities (may return empty; that's fine)
  send(proc, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "search_entities", arguments: { page: 1, limit: 1 } },
  });
  const entitiesResp = await waitFor(proc, 4);
  if (entitiesResp.error) throw new Error(`search_entities failed: ${JSON.stringify(entitiesResp.error)}`);

  console.error("[mcp-smoke-test] PASS");
  proc.kill();
}

main().catch((err) => {
  console.error("[mcp-smoke-test] FAIL", err);
  process.exit(1);
});

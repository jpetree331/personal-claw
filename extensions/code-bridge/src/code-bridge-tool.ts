/**
 * OpenClaw tools for the local code bridge (list, read, write, run).
 * Requires the code bridge service running on the user's PC and baseUrl/apiKey in plugin config.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";
import type { AnyAgentTool } from "../../../src/agents/tools/common.js";
import { jsonResult } from "../../../src/agents/tools/common.js";

type PluginCfg = {
  baseUrl?: string;
  apiKey?: string;
};

function getConfig(api: OpenClawPluginApi): { baseUrl: string; apiKey: string } {
  const cfg = (api.pluginConfig ?? {}) as PluginCfg;
  const baseUrl = (cfg.baseUrl ?? process.env.CODE_BRIDGE_BASE_URL ?? "").trim();
  const apiKey = (cfg.apiKey ?? process.env.CODE_BRIDGE_API_KEY ?? "").trim();
  if (!baseUrl) {
    throw new Error(
      "Code Bridge: baseUrl is required. Set it in plugin config or CODE_BRIDGE_BASE_URL (your ngrok/Tailscale URL).",
    );
  }
  if (!apiKey) {
    throw new Error("Code Bridge: apiKey is required. Set it in plugin config or CODE_BRIDGE_API_KEY.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function fetchBridge(
  baseUrl: string,
  apiKey: string,
  path: string,
  options: { method?: string; body?: string } = {},
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "X-API-Key": apiKey,
      "Accept": "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body,
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export function createCodeBridgeTools(api: OpenClawPluginApi): AnyAgentTool[] {
  const listSchema = Type.Object({
    path: Type.Optional(Type.String({ description: "Relative path under project root (e.g. src or .). Default: ." })),
  });
  const readSchema = Type.Object({
    path: Type.String({ description: "Relative path to file under project root (e.g. src/main.py)." }),
  });
  const writeSchema = Type.Object({
    path: Type.String({ description: "Relative path to file (e.g. src/foo.py). Creates parent dirs if needed." }),
    content: Type.String({ description: "Full file content to write." }),
  });
  const runSchema = Type.Object({
    command: Type.String({ description: "Shell command to run (e.g. npm install, git status)." }),
    cwd: Type.Optional(Type.String({ description: "Working directory relative to project root. Default: ." })),
  });

  return [
    {
      label: "Code Bridge (list)",
      name: "code_bridge_list",
      description:
        "List directory contents in the user's local project (via code bridge). Path is relative to the project root. Use to discover files and folders.",
      parameters: listSchema,
      execute: async (_id, params) => {
        const { baseUrl, apiKey } = getConfig(api);
        const path = typeof params.path === "string" ? params.path : "";
        const qs = path ? `?path=${encodeURIComponent(path)}` : "";
        const { ok, status, body } = await fetchBridge(baseUrl, apiKey, `/list${qs}`);
        if (!ok) throw new Error(`Code Bridge list failed: ${status} ${body}`);
        return jsonResult(JSON.parse(body));
      },
    },
    {
      label: "Code Bridge (read)",
      name: "code_bridge_read",
      description: "Read a file from the user's local project (via code bridge). Path is relative to the project root.",
      parameters: readSchema,
      execute: async (_id, params) => {
        const { baseUrl, apiKey } = getConfig(api);
        const path = typeof params.path === "string" ? params.path.trim() : "";
        if (!path) throw new Error("path is required");
        const { ok, status, body } = await fetchBridge(baseUrl, apiKey, `/read?path=${encodeURIComponent(path)}`);
        if (!ok) throw new Error(`Code Bridge read failed: ${status} ${body}`);
        return jsonResult({ content: body });
      },
    },
    {
      label: "Code Bridge (write)",
      name: "code_bridge_write",
      description:
        "Write a file in the user's local project (via code bridge). Path is relative to the project root; creates parent dirs if needed.",
      parameters: writeSchema,
      execute: async (_id, params) => {
        const { baseUrl, apiKey } = getConfig(api);
        const path = typeof params.path === "string" ? params.path.trim() : "";
        const content = typeof params.content === "string" ? params.content : "";
        if (!path) throw new Error("path is required");
        const { ok, status, body } = await fetchBridge(baseUrl, apiKey, "/write", {
          method: "POST",
          body: JSON.stringify({ path, content }),
        });
        if (!ok) throw new Error(`Code Bridge write failed: ${status} ${body}`);
        return jsonResult(JSON.parse(body));
      },
    },
    {
      label: "Code Bridge (run)",
      name: "code_bridge_run",
      description:
        "Run a shell command in the user's local project (via code bridge). Only works if the bridge has CODE_BRIDGE_ALLOW_RUN=1. Use for npm install, git status, etc.",
      parameters: runSchema,
      execute: async (_id, params) => {
        const { baseUrl, apiKey } = getConfig(api);
        const command = typeof params.command === "string" ? params.command.trim() : "";
        const cwd = typeof params.cwd === "string" ? params.cwd.trim() : "";
        if (!command) throw new Error("command is required");
        const { ok, status, body } = await fetchBridge(baseUrl, apiKey, "/run", {
          method: "POST",
          body: JSON.stringify({ command, cwd }),
        });
        if (!ok) throw new Error(`Code Bridge run failed: ${status} ${body}`);
        return jsonResult(JSON.parse(body));
      },
    },
  ];
}

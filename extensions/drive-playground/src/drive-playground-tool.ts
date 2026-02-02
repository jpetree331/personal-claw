/**
 * OpenClaw tools for the Drive Playground service (list, read, write).
 * Requires the Python drive_playground_service to be running and baseUrl/apiKey in plugin config.
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
  const baseUrl = (cfg.baseUrl ?? process.env.DRIVE_PLAYGROUND_BASE_URL ?? "").trim();
  const apiKey =
    (cfg.apiKey ?? process.env.DRIVE_PLAYGROUND_API_KEY ?? "").trim();
  if (!baseUrl) {
    throw new Error("Drive Playground: baseUrl is required. Set it in plugin config or DRIVE_PLAYGROUND_BASE_URL.");
  }
  if (!apiKey) {
    throw new Error("Drive Playground: apiKey is required. Set it in plugin config or DRIVE_PLAYGROUND_API_KEY.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function fetchDrive(
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

export function createDrivePlaygroundTools(api: OpenClawPluginApi): AnyAgentTool[] {
  const listSchema = Type.Object({
    folder_id: Type.Optional(
      Type.String({
        description:
          "Folder ID to list inside. Omit to list the Playground root. Use the id of a subfolder from a previous list to see files inside that subfolder.",
      }),
    ),
    page_token: Type.Optional(Type.String({ description: "Pagination token from previous list response." })),
    page_size: Type.Optional(Type.Number({ description: "Max files to return (1–100).", minimum: 1, maximum: 100 })),
  });
  const readSchema = Type.Object({
    file_id: Type.String({
      description: "Google Drive file ID from drive_playground_list. Can be a file in the root or inside any subfolder.",
    }),
  });
  const writeSchema = Type.Object({
    name: Type.String({ description: "File name (e.g. notes.txt, journal.md)." }),
    content: Type.String({ description: "Full text content to write." }),
    mime_type: Type.Optional(Type.String({ description: "MIME type; default text/plain." })),
    folder_id: Type.Optional(
      Type.String({
        description:
          "Folder ID to write into. Omit to write in the Playground root. Use a subfolder id from drive_playground_list to write inside that folder.",
      }),
    ),
  });

  return [
    {
      label: "Drive Playground (list)",
      name: "drive_playground_list",
      description:
        "List files in the OpenClaw Playground folder on Google Drive (My Drive → Personal → AI Research → OpenClaw Playground). Omit folder_id to list the root; pass a subfolder's id to list inside that subfolder. Returns id, name, mimeType, modifiedTime, size. Use to discover file IDs before reading.",
      parameters: listSchema,
      execute: async (_id, params) => {
        const { baseUrl, apiKey } = getConfig(api);
        const folderId = typeof params.folder_id === "string" ? params.folder_id.trim() : undefined;
        const pageToken = typeof params.page_token === "string" ? params.page_token : undefined;
        const pageSize = typeof params.page_size === "number" ? params.page_size : 50;
        const qs = new URLSearchParams();
        if (folderId) qs.set("folder_id", folderId);
        if (pageToken) qs.set("page_token", pageToken);
        qs.set("page_size", String(pageSize));
        const { ok, status, body } = await fetchDrive(baseUrl, apiKey, `/list?${qs.toString()}`);
        if (!ok) {
          throw new Error(`Drive Playground list failed: ${status} ${body}`);
        }
        return jsonResult(JSON.parse(body));
      },
    },
    {
      label: "Drive Playground (read)",
      name: "drive_playground_read",
      description:
        "Read the text content of a file in the OpenClaw Playground folder (root or any subfolder). Use drive_playground_list to get file IDs.",
      parameters: readSchema,
      execute: async (_id, params) => {
        const { baseUrl, apiKey } = getConfig(api);
        const fileId = typeof params.file_id === "string" ? params.file_id.trim() : "";
        if (!fileId) {
          throw new Error("file_id is required");
        }
        const { ok, status, body } = await fetchDrive(baseUrl, apiKey, `/files/${encodeURIComponent(fileId)}/content`);
        if (!ok) {
          throw new Error(`Drive Playground read failed: ${status} ${body}`);
        }
        return jsonResult({ content: body });
      },
    },
    {
      label: "Drive Playground (write)",
      name: "drive_playground_write",
      description:
        "Create or update a file in the OpenClaw Playground folder (root or a subfolder). Omit folder_id for root; pass a subfolder id to write inside it. If a file with the same name exists in that folder, it is updated; otherwise created.",
      parameters: writeSchema,
      execute: async (_id, params) => {
        const { baseUrl, apiKey } = getConfig(api);
        const name = typeof params.name === "string" ? params.name.trim() : "";
        const content = typeof params.content === "string" ? params.content : "";
        const mime_type = typeof params.mime_type === "string" ? params.mime_type : "text/plain";
        const folder_id = typeof params.folder_id === "string" ? params.folder_id.trim() || undefined : undefined;
        if (!name) {
          throw new Error("name is required");
        }
        const { ok, status, body } = await fetchDrive(baseUrl, apiKey, "/write", {
          method: "POST",
          body: JSON.stringify({ name, content, mime_type, folder_id }),
        });
        if (!ok) {
          throw new Error(`Drive Playground write failed: ${status} ${body}`);
        }
        return jsonResult(JSON.parse(body));
      },
    },
  ];
}

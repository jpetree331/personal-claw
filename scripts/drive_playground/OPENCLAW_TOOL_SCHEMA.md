# OpenClaw tool schema: Google Drive Playground

Explicit schema for three tools that call the Drive Playground service (`drive_playground_service.py`). Use this to implement an OpenClaw plugin or custom tool.

**Base URL:** Set via config (e.g. `DRIVE_PLAYGROUND_BASE_URL` or plugin config). Example: `http://localhost:8765` or `https://your-ngrok-url.ngrok.io`.

**Auth:** Every request must include the API key:

- Header: `X-API-Key: <DRIVE_PLAYGROUND_API_KEY>`  
- Or: `Authorization: Bearer <DRIVE_PLAYGROUND_API_KEY>`

---

## Tool 1: `drive_playground_list`

**Description (for the model):**

List files in the OpenClaw Playground folder on Google Drive (My Drive → Personal → AI Research → OpenClaw Playground). Returns file id, name, mimeType, modifiedTime, size. Use this to discover file IDs before reading.

**Parameters (JSON Schema):**

```json
{
  "type": "object",
  "properties": {
    "page_token": {
      "type": "string",
      "description": "Optional. Token from previous list response for pagination."
    },
    "page_size": {
      "type": "integer",
      "description": "Max number of files to return (1–100). Default 50.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    }
  }
}
```

**HTTP request:**

- **Method:** `GET`
- **URL:** `{baseUrl}/list`
  - Query: `page_token` (optional), `page_size` (optional, default 50)
- **Headers:** `X-API-Key: {apiKey}` or `Authorization: Bearer {apiKey}`

**Example:** `GET http://localhost:8765/list?page_size=20`

**Response:** JSON with `files` (array of `{ id, name, mimeType, modifiedTime, size }`) and optional `nextPageToken`.

---

## Tool 2: `drive_playground_read`

**Description (for the model):**

Read the text content of a file in the OpenClaw Playground folder. The file must be a direct child of that folder (use drive_playground_list to get file IDs).

**Parameters (JSON Schema):**

```json
{
  "type": "object",
  "properties": {
    "file_id": {
      "type": "string",
      "description": "Google Drive file ID (from drive_playground_list)."
    }
  },
  "required": ["file_id"]
}
```

**HTTP request:**

- **Method:** `GET`
- **URL:** `{baseUrl}/files/{file_id}/content`
- **Headers:** `X-API-Key: {apiKey}` or `Authorization: Bearer {apiKey}`

**Example:** `GET http://localhost:8765/files/abc123xyz/content`

**Response:** Plain text (file body). 403 if file is not in the Playground folder; 404 if not found.

---

## Tool 3: `drive_playground_write`

**Description (for the model):**

Create or update a file in the OpenClaw Playground folder. If a file with the same name already exists, it is updated; otherwise a new file is created.

**Parameters (JSON Schema):**

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "File name (e.g. notes.txt, journal-2026-02-15.md)."
    },
    "content": {
      "type": "string",
      "description": "Full text content to write."
    },
    "mime_type": {
      "type": "string",
      "description": "MIME type. Default text/plain.",
      "default": "text/plain"
    }
  },
  "required": ["name", "content"]
}
```

**HTTP request:**

- **Method:** `POST`
- **URL:** `{baseUrl}/write`
- **Headers:**
  - `X-API-Key: {apiKey}` or `Authorization: Bearer {apiKey}`
  - `Content-Type: application/json`
- **Body:** JSON `{ "name": "<filename>", "content": "<text>", "mime_type": "text/plain" }`

**Example:**

```http
POST http://localhost:8765/write
Content-Type: application/json
X-API-Key: your-secret-key

{"name": "journal-2026-02-15.md", "content": "# Today\n\nNotes here...", "mime_type": "text/plain"}
```

**Response:** JSON `{ "id": "<drive_file_id>", "action": "created" }` or `"updated"`.

---

## TypeBox schema (for OpenClaw plugin in TypeScript)

Use these with `@sinclair/typebox` and `parameters: Schema` when defining `AnyAgentTool`:

```ts
import { Type } from "@sinclair/typebox";

// drive_playground_list
const DrivePlaygroundListSchema = Type.Object({
  page_token: Type.Optional(Type.String()),
  page_size: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
});

// drive_playground_read
const DrivePlaygroundReadSchema = Type.Object({
  file_id: Type.String(),
});

// drive_playground_write
const DrivePlaygroundWriteSchema = Type.Object({
  name: Type.String(),
  content: Type.String(),
  mime_type: Type.Optional(Type.String()),
});
```

---

## Config / environment

- **Base URL:** e.g. `DRIVE_PLAYGROUND_BASE_URL` or plugin `baseUrl` (no trailing slash).
- **API key:** `DRIVE_PLAYGROUND_API_KEY` — same value the Python service expects; pass in `X-API-Key` or `Authorization: Bearer` on every request.

---

## Enabling the tool in OpenClaw

### Option A: Use the bundled extension

This repo includes an extension **`extensions/drive-playground`** that implements the three tools. To use it:

1. **Load the plugin**  
   Add the extension to your config so OpenClaw loads it (e.g. `plugins.load.paths` if you run from source, or ensure the extension is bundled).

2. **Plugin config**  
   In `openclaw.json` (or your config file), add:

   ```json
   "plugins": {
     "entries": {
       "drive-playground": {
         "enabled": true,
         "config": {
           "baseUrl": "http://localhost:8765",
           "apiKey": "${DRIVE_PLAYGROUND_API_KEY}"
         }
       }
     }
   }
   ```

   Set `baseUrl` to the URL where `drive_playground_service.py` is running (e.g. your PC with ngrok, or a VPS). Set `DRIVE_PLAYGROUND_API_KEY` in the environment (or paste the key in `apiKey`; avoid committing it).

3. **Allow the tools**  
   In `tools.allow` add the tool names so the agent can use them, e.g.:

   ```json
   "tools": {
     "allow": ["drive_playground_list", "drive_playground_read", "drive_playground_write"]
   }
   ```

   Or allow the whole plugin group if your config supports it (e.g. `"drive-playground"` or `"group:drive-playground"`).

4. **Service:** Run `drive_playground_service.py` and ensure OpenClaw (or Railway) can reach its base URL (e.g. Tailscale, ngrok, or same host).

### Option B: Implement your own plugin

Use the schema and HTTP request details above to implement an OpenClaw extension that registers one tool per action and calls the Drive Playground HTTP API.

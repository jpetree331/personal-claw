# Google Drive OpenClaw Playground service

Small HTTP API so your OpenClaw bot can list, read, and write files in a single Google Drive folder:

**My Drive → Personal → AI Research → OpenClaw Playground**

## 1. Google Cloud setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or pick one) and enable **Google Drive API** (APIs & Services → Enable APIs).
3. **OAuth consent screen**: Configure if needed (External, add your email as test user).
4. **Credentials** → Create credentials → **OAuth client ID** → Application type: **Desktop app** → Create.
5. Download the JSON and save it as `credentials.json` in this directory (`scripts/drive_playground/`).

## 2. Folder in Drive

Create this structure in Google Drive (or use an existing one):

- **My Drive** → **Personal** → **AI Research** → **OpenClaw Playground**

Alternatively, open the folder you want in Drive, copy the folder ID from the URL  
(`https://drive.google.com/drive/folders/<FOLDER_ID>`) and set:

```bash
export DRIVE_PLAYGROUND_FOLDER_ID="your-folder-id"
```

Then the path above is ignored.

## 3. API key for OpenClaw

Choose a secret (e.g. a long random string) and set it so only your bot can call this API:

```bash
export DRIVE_PLAYGROUND_API_KEY="your-secret-api-key"
```

Use the same value in your OpenClaw tool config when calling this service.

### Running in the same Railway service as OpenClaw

You can run this service **in the same container** as OpenClaw on Railway. Set these as **Railway Variables** (no credential files):

- **GOOGLE_DRIVE_TOKEN_JSON** — Full contents of `token.json` (do OAuth once locally, then paste the file content).
- **DRIVE_PLAYGROUND_API_KEY** — Secret for the OpenClaw tool to call this API.
- **DRIVE_PLAYGROUND_FOLDER_ID** — (optional) Your Drive folder ID.
- **DRIVE_PLAYGROUND_PORT** — (optional) Default `8765`.

The entrypoint starts the Python service when both `GOOGLE_DRIVE_TOKEN_JSON` and `DRIVE_PLAYGROUND_API_KEY` are set. In OpenClaw config set `baseUrl` to `http://127.0.0.1:8765` (or your port). See [Deploy on Railway](/docs/railway) for the full snippet.

## 4. Run the service

```bash
cd scripts/drive_playground
pip install -r requirements.txt
python drive_playground_service.py
```

First run will open a browser for Google sign-in; the token is saved to `token.json` (do not commit it).

Default port: **8765**. Override with `PORT=9000 python drive_playground_service.py`.

To expose it to OpenClaw on Railway, run this on your PC and use something like **Tailscale** or **ngrok** so the Railway gateway can reach `http://your-pc:8765`, or run the service on a small VPS and point OpenClaw at that URL.

## 5. API endpoints

All requests require header: `X-API-Key: <DRIVE_PLAYGROUND_API_KEY>` or `Authorization: Bearer <DRIVE_PLAYGROUND_API_KEY>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | No auth; returns `{"status":"ok"}`. |
| GET | `/list` | List files in the Playground folder. Query: `page_token`, `page_size` (default 50). |
| GET | `/files/{file_id}/content` | Read file content (direct children of Playground only). |
| POST | `/write` | Create or update a file. Body: `{"name": "filename.txt", "content": "...", "mime_type": "text/plain"}`. |

## 6. OpenClaw tool

Add an OpenClaw tool that calls this API (e.g. HTTP GET/POST to your service URL with the API key). The tool can:

- **List** files in the Playground folder.
- **Read** a file by ID (from list).
- **Write** a file (create or overwrite by name).

See OpenClaw docs for defining custom tools that call external HTTP APIs.

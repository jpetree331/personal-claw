#!/usr/bin/env python3
"""
Google Drive "OpenClaw Playground" service for OpenClaw.

Scopes access to a single folder:
  My Drive --> Personal --> AI Research --> OpenClaw Playground

Exposes a small HTTP API (list, read, write) so an OpenClaw tool can call it.
Run: uvicorn drive_playground_service:app --host 0.0.0.0 --port 8765

Setup:
  1. Create a project in Google Cloud Console, enable Google Drive API.
  2. Create OAuth 2.0 credentials (Desktop app), download as credentials.json
     into this directory (or set GOOGLE_APPLICATION_CREDENTIALS).
  3. Set DRIVE_PLAYGROUND_API_KEY (secret for OpenClaw to call this API).
  4. Set DRIVE_PLAYGROUND_FOLDER_ID to your folder ID (from Drive URL when you
     open the folder), OR leave unset to resolve by path:
     Personal / AI Research / OpenClaw Playground
  5. First run: a browser will open for Google sign-in; token is saved to
     token.json (add to .gitignore).
"""

import json
import os
import io
from pathlib import Path

from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

# Google Drive
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------
SCOPES = ["https://www.googleapis.com/auth/drive"]
SCRIPT_DIR = Path(__file__).resolve().parent
CREDENTIALS_FILE = SCRIPT_DIR / "credentials.json"
TOKEN_FILE = SCRIPT_DIR / "token.json"
# Folder path to resolve if DRIVE_PLAYGROUND_FOLDER_ID is not set (under My Drive root)
PLAYGROUND_PATH = ["Personal", "AI Research", "OpenClaw Playground"]


def get_api_key() -> str:
    key = (os.environ.get("DRIVE_PLAYGROUND_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("Set DRIVE_PLAYGROUND_API_KEY in the environment.")
    return key


def get_drive_service():
    """Load credentials from env (Railway) or from token/credentials files (local)."""
    creds = None
    token_json = (os.environ.get("GOOGLE_DRIVE_TOKEN_JSON") or "").strip()
    if token_json:
        try:
            token_data = json.loads(token_json)
            creds = Credentials.from_authorized_user_info(token_data, SCOPES)
        except (json.JSONDecodeError, ValueError) as e:
            raise ValueError(
                "GOOGLE_DRIVE_TOKEN_JSON is set but invalid. Paste the full contents of token.json (from a local OAuth run)."
            ) from e
    elif TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds and not creds.valid and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        # First-time OAuth (local only; use credentials file or env)
        creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or CREDENTIALS_FILE
        credentials_json = (os.environ.get("GOOGLE_DRIVE_CREDENTIALS_JSON") or "").strip()
        if credentials_json:
            try:
                client_config = json.loads(credentials_json)
                flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
                creds = flow.run_local_server(port=0)
            except (json.JSONDecodeError, ValueError) as e:
                raise ValueError(
                    "GOOGLE_DRIVE_CREDENTIALS_JSON is set but invalid. Paste the full contents of credentials.json."
                ) from e
        elif creds_path and Path(creds_path).exists():
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
            creds = flow.run_local_server(port=0)
        else:
            raise FileNotFoundError(
                "Google OAuth credentials not found. For Railway: set GOOGLE_DRIVE_TOKEN_JSON (full token.json from a local OAuth run). "
                "For local first run: save credentials.json here or set GOOGLE_DRIVE_CREDENTIALS_JSON."
            )
        if not token_json and TOKEN_FILE.exists() is False:
            with open(TOKEN_FILE, "w") as f:
                f.write(creds.to_json())
    return build("drive", "v3", credentials=creds)


def get_playground_folder_id(service) -> str:
    folder_id = (os.environ.get("DRIVE_PLAYGROUND_FOLDER_ID") or "").strip()
    if folder_id:
        return folder_id
    # Resolve by path: My Drive -> Personal -> AI Research -> OpenClaw Playground
    parent_id = "root"
    for name in PLAYGROUND_PATH:
        result = (
            service.files()
            .list(
                q=f"'{parent_id}' in parents and name = '{name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                spaces="drive",
                fields="files(id, name)",
                pageSize=1,
            )
            .execute()
        )
        files = result.get("files", [])
        if not files:
            raise ValueError(
                f"Folder not found: {' / '.join(PLAYGROUND_PATH)}. "
                f"Missing after: {name}. Create the folder in Drive or set DRIVE_PLAYGROUND_FOLDER_ID to the folder ID."
            )
        parent_id = files[0]["id"]
    return parent_id


def require_api_key(x_api_key: str | None = Header(None), authorization: str | None = Header(None)):
    key = get_api_key()
    bearer = (authorization or "").strip().removeprefix("Bearer ")
    if (x_api_key or bearer) != key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# -----------------------------------------------------------------------------
# FastAPI app
# -----------------------------------------------------------------------------
app = FastAPI(
    title="Drive Playground API",
    description="List, read, and write files in OpenClaw Playground folder on Google Drive.",
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/list", dependencies=[])
def list_files(
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None),
    page_token: str | None = Query(None),
    page_size: int = Query(50, ge=1, le=100),
):
    require_api_key(x_api_key, authorization)
    service = get_drive_service()
    folder_id = get_playground_folder_id(service)
    q = f"'{folder_id}' in parents and trashed = false"
    result = (
        service.files()
        .list(
            q=q,
            spaces="drive",
            fields="nextPageToken, files(id, name, mimeType, modifiedTime, size)",
            pageSize=page_size,
            pageToken=page_token or "",
        )
        .execute()
    )
    return {
        "files": result.get("files", []),
        "nextPageToken": result.get("nextPageToken"),
    }


@app.get("/files/{file_id}/content")
def read_file(
    file_id: str,
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None),
):
    require_api_key(x_api_key, authorization)
    service = get_drive_service()
    folder_id = get_playground_folder_id(service)
    meta = service.files().get(fileId=file_id, fields="id, name, mimeType, parents").execute()
    parents = meta.get("parents") or []
    if folder_id not in parents:
        raise HTTPException(
            status_code=403,
            detail="File is not a direct child of the Playground folder. Use /list to get file IDs.",
        )
    try:
        request = service.files().get_media(fileId=file_id)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        buf.seek(0)
        return PlainTextResponse(buf.read().decode("utf-8", errors="replace"))
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


class WriteBody(BaseModel):
    name: str
    content: str
    mime_type: str = "text/plain"


@app.post("/write")
def write_file(
    body: WriteBody,
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None),
):
    require_api_key(x_api_key, authorization)
    service = get_drive_service()
    folder_id = get_playground_folder_id(service)
    # Check if file exists (same name in folder)
    existing = (
        service.files()
        .list(
            q=f"'{folder_id}' in parents and name = '{body.name}' and trashed = false",
            fields="files(id)",
            pageSize=1,
        )
        .execute()
    )
    files = existing.get("files", [])
    meta = {"name": body.name, "mimeType": body.mime_type, "parents": [folder_id]}
    media = MediaIoBaseUpload(
        io.BytesIO(body.content.encode("utf-8")),
        mimetype=body.mime_type,
        resumable=False,
    )
    if files:
        file_id = files[0]["id"]
        service.files().update(fileId=file_id, body={"name": body.name}).execute()
        service.files().update(fileId=file_id, media_body=media).execute()
        return {"id": file_id, "action": "updated"}
    else:
        created = service.files().create(body=meta, media_body=media, fields="id").execute()
        return {"id": created["id"], "action": "created"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8765"))
    uvicorn.run(app, host="0.0.0.0", port=port)

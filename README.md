# Zoom Clone (Next.js + FastAPI + SQLite)

## Stack
Next.js 14 (App Router, JS) · FastAPI · SQLite (stdlib `sqlite3`, raw SQL) · plain CSS.

## Run locally
```bash
cd backend && pip install -r requirements.txt && uvicorn main:app --reload   # :8000 (creates + seeds zoom.db)
cd frontend && npm install && npm run dev                                    # :3000
```
Env: `NEXT_PUBLIC_API_URL` (frontend → API), `FRONTEND_URL` and `DB_PATH` (backend).

## Schema
`users 1─∞ meetings 1─∞ participants` (participants.user_id nullable for guests).
meetings: unique 10-digit `code`, `type` (instant/scheduled), `status` (scheduled/live/ended), `scheduled_at`, `duration_min`. Indexes on (status, scheduled_at) and (meeting_id, left_at).

## Features
Dashboard (clock, New/Join/Schedule, upcoming + recent) · instant meeting with ID + invite link · join by ID or link with name + validation · schedule with title/description/date/time/duration · lobby with camera preview · participants panel · host controls (mute all, remove, end for all) · responsive layout.

## Assumptions
- Default user "Alex Morgan" is always logged in (no auth).
- Participant lists sync by polling; tiles show avatars. Real audio/video between users (WebRTC/SFU such as LiveKit) is not implemented; only the local camera preview is real.
- Host powers are granted only to the default user on meetings they own (client-supplied flag + server owner check; fine for the demo, not production-secure).

## Deploy
Backend: Render/Railway (`uvicorn main:app --host 0.0.0.0 --port $PORT`). Frontend: Vercel with `NEXT_PUBLIC_API_URL` set.

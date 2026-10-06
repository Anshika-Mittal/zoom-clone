import os, random, sqlite3
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB = os.getenv("DB_PATH", "zoom.db")
FRONTEND = os.getenv("FRONTEND_URL", "http://localhost:3000")
DEFAULT_USER = 1  # no auth: a default user is always logged in

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS meetings(
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  host_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT DEFAULT '',
  type TEXT NOT NULL CHECK(type IN ('instant','scheduled')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','ended')),
  scheduled_at TEXT, duration_min INTEGER DEFAULT 60,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participants(
  id INTEGER PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant' CHECK(role IN ('host','participant')),
  muted INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL, left_at TEXT);
CREATE INDEX IF NOT EXISTS idx_meet_sched ON meetings(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_part_meet ON participants(meeting_id, left_at);
"""

def conn():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON"); return c

def q(sql, args=()):
    with conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]

def run(sql, args=()):
    with conn() as c:
        return c.execute(sql, args).lastrowid

now = lambda: datetime.now().isoformat(timespec="minutes")

def new_code():
    while True:
        code = str(random.randint(10**9, 10**10 - 1))
        if not q("SELECT 1 FROM meetings WHERE code=?", (code,)): return code

def out(m):
    m["join_url"] = f"{FRONTEND}/meeting/{m['code']}"
    return m

def get_meeting(code):
    rows = q("SELECT * FROM meetings WHERE code=?", (code.replace(" ", ""),))
    if not rows: raise HTTPException(404, "Meeting not found")
    return rows[0]

def seed():
    with conn() as c: c.executescript(SCHEMA)
    if q("SELECT 1 FROM users"): return
    run("INSERT INTO users(id,name,email) VALUES(1,'Alex Morgan','alex@example.com')")
    t = datetime.now().replace(minute=0, second=0, microsecond=0)
    items = [("Weekly Team Sync", "Roadmap and blockers", t + timedelta(hours=3), 45, "scheduled"),
             ("Design Review", "Review new dashboard", t + timedelta(days=1, hours=1), 60, "scheduled"),
             ("Client Onboarding", "Kickoff with Acme", t + timedelta(days=2), 30, "scheduled"),
             ("Sprint Retro", "", t - timedelta(days=1), 60, "ended"),
             ("1:1 with Sam", "", t - timedelta(days=2), 30, "ended"),
             ("Product Demo", "", t - timedelta(days=4), 45, "ended")]
    for title, d, when, dur, st in items:
        mid = run("INSERT INTO meetings(code,host_id,title,description,type,status,scheduled_at,duration_min,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                  (new_code(), 1, title, d, "scheduled", st, when.isoformat(timespec="minutes"), dur, now()))
        for n, r in [("Alex Morgan", "host"), ("Sam Lee", "participant"), ("Priya Shah", "participant")]:
            run("INSERT INTO participants(meeting_id,display_name,role,joined_at,left_at) VALUES(?,?,?,?,?)",
                (mid, n, r, when.isoformat(), when.isoformat() if st == "ended" else None))

app = FastAPI(title="Zoom Clone API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
seed()

class Instant(BaseModel): title: str = "Alex Morgan's Meeting"
class Schedule(BaseModel):
    title: str; description: str = ""; scheduled_at: str; duration_min: int = 60
class Join(BaseModel): display_name: str; as_host: bool = False
class Mute(BaseModel): muted: bool

@app.get("/api/user")
def user(): return q("SELECT * FROM users WHERE id=?", (DEFAULT_USER,))[0]

@app.get("/api/meetings")
def list_meetings(kind: str = "upcoming"):
    if kind == "upcoming":
        rows = q("SELECT * FROM meetings WHERE type='scheduled' AND status!='ended' AND datetime(scheduled_at, '+'||duration_min||' minutes') >= datetime(?) ORDER BY scheduled_at", (now(),))
    else:
        rows = q("SELECT * FROM meetings WHERE status='ended' ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 10")
    return [out(m) for m in rows]

@app.post("/api/meetings/instant")
def instant(b: Instant):
    code = new_code()
    run("INSERT INTO meetings(code,host_id,title,type,status,created_at) VALUES(?,?,?,?,?,?)",
        (code, DEFAULT_USER, b.title, "instant", "live", now()))
    return out(get_meeting(code))

@app.post("/api/meetings/schedule")
def schedule(b: Schedule):
    if not b.title.strip(): raise HTTPException(422, "Title required")
    code = new_code()
    run("INSERT INTO meetings(code,host_id,title,description,type,scheduled_at,duration_min,created_at) VALUES(?,?,?,?,?,?,?,?)",
        (code, DEFAULT_USER, b.title.strip(), b.description, "scheduled", b.scheduled_at, b.duration_min, now()))
    return out(get_meeting(code))

@app.get("/api/meetings/{code}")
def validate(code: str):
    m = get_meeting(code)
    if m["status"] == "ended" and m["type"] == "instant": raise HTTPException(410, "Meeting has ended")
    return out(m)

@app.post("/api/meetings/{code}/join")
def join(code: str, b: Join):
    m = get_meeting(code)
    if not b.display_name.strip(): raise HTTPException(422, "Name required")
    host = b.as_host and m["host_id"] == DEFAULT_USER
    pid = run("INSERT INTO participants(meeting_id,user_id,display_name,role,joined_at) VALUES(?,?,?,?,?)",
              (m["id"], DEFAULT_USER if host else None, b.display_name.strip(), "host" if host else "participant", now()))
    run("UPDATE meetings SET status='live' WHERE id=?", (m["id"],))
    return {"participant_id": pid, "role": "host" if host else "participant", "meeting": out(get_meeting(code))}

@app.get("/api/meetings/{code}/participants")
def participants(code: str):
    m = get_meeting(code)
    return q("SELECT id,display_name,role,muted FROM participants WHERE meeting_id=? AND left_at IS NULL ORDER BY id", (m["id"],))

@app.post("/api/meetings/{code}/participants/{pid}/leave")
def leave(code: str, pid: int):
    m = get_meeting(code)
    run("UPDATE participants SET left_at=? WHERE id=? AND meeting_id=?", (now(), pid, m["id"]))
    if not participants(code): run("UPDATE meetings SET status='ended' WHERE id=?", (m["id"],))
    return {"ok": True}

@app.patch("/api/meetings/{code}/participants/{pid}")
def set_mute(code: str, pid: int, b: Mute):
    m = get_meeting(code)
    run("UPDATE participants SET muted=? WHERE id=? AND meeting_id=?", (int(b.muted), pid, m["id"]))
    return {"ok": True}

@app.post("/api/meetings/{code}/mute-all")
def mute_all(code: str):
    m = get_meeting(code)
    run("UPDATE participants SET muted=1 WHERE meeting_id=? AND role!='host' AND left_at IS NULL", (m["id"],))
    return {"ok": True}

@app.post("/api/meetings/{code}/end")
def end(code: str):
    m = get_meeting(code)
    run("UPDATE participants SET left_at=? WHERE meeting_id=? AND left_at IS NULL", (now(), m["id"]))
    run("UPDATE meetings SET status='ended' WHERE id=?", (m["id"],))
    return {"ok": True}

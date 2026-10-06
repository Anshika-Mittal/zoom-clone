"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtId, parseCode } from "../lib/api";

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>{children}
      </div>
    </div>
  );
}

function JoinModal({ onClose }) {
  const router = useRouter();
  const [id, setId] = useState(""), [name, setName] = useState("Alex Morgan"), [err, setErr] = useState("");
  const submit = async () => {
    const code = parseCode(id);
    try {
      if (!code) throw new Error("Invalid meeting ID. Check and try again.");
      await api(`/meetings/${code}`);
      router.push(`/meeting/${code}?name=${encodeURIComponent(name)}`);
    } catch (e) { setErr(e.message === "Meeting not found" ? "Invalid meeting ID. Check and try again." : e.message); }
  };
  return (
    <Modal title="Join Meeting" onClose={onClose}>
      <input placeholder="Meeting ID or invite link" value={id} onChange={(e) => setId(e.target.value)} />
      <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      {err && <p className="err">{err}</p>}
      <div className="row"><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!id || !name.trim()} onClick={submit}>Join</button></div>
    </Modal>
  );
}

function ScheduleModal({ onClose, onDone }) {
  const [f, setF] = useState({ title: "", description: "", date: new Date().toISOString().slice(0, 10), time: "10:00", duration_min: 60 });
  const [created, setCreated] = useState(null), [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      setCreated(await api("/meetings/schedule", "POST", { title: f.title, description: f.description, scheduled_at: `${f.date}T${f.time}`, duration_min: +f.duration_min }));
      onDone();
    } catch (e) { setErr(e.message); }
  };
  if (created) return (
    <Modal title="Meeting scheduled" onClose={onClose}>
      <p><b>{created.title}</b></p><p>Meeting ID: {fmtId(created.code)}</p>
      <input readOnly value={created.join_url} onFocus={(e) => e.target.select()} />
      <div className="row"><button className="btn ghost" onClick={() => navigator.clipboard.writeText(created.join_url)}>Copy link</button>
        <button className="btn" onClick={onClose}>Done</button></div>
    </Modal>
  );
  return (
    <Modal title="Schedule Meeting" onClose={onClose}>
      <input placeholder="Meeting title" value={f.title} onChange={set("title")} />
      <textarea placeholder="Description (optional)" value={f.description} onChange={set("description")} />
      <div className="row"><input type="date" value={f.date} onChange={set("date")} /><input type="time" value={f.time} onChange={set("time")} /></div>
      <select value={f.duration_min} onChange={set("duration_min")}>
        {[15, 30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}
      </select>
      {err && <p className="err">{err}</p>}
      <div className="row"><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!f.title.trim()} onClick={save}>Save</button></div>
    </Modal>
  );
}

function MeetingList({ title, items, upcoming, onStart }) {
  const fmt = (m) => new Date(m.scheduled_at || m.created_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <section className="card">
      <h2>{title}</h2>
      {items.length === 0 && <p className="muted">No meetings.</p>}
      {items.map((m) => (
        <div className="item" key={m.id}>
          <div><b>{m.title}</b><div className="muted">{fmt(m)} · {m.duration_min} min · ID {fmtId(m.code)}</div></div>
          {upcoming && <button className="btn sm" onClick={() => onStart(m)}>Start</button>}
        </div>
      ))}
    </section>
  );
}

export default function Home() {
  const router = useRouter();
  const [modal, setModal] = useState(null), [up, setUp] = useState([]), [recent, setRecent] = useState([]), [now, setNow] = useState(new Date());
  const load = () => { api("/meetings?kind=upcoming").then(setUp); api("/meetings?kind=recent").then(setRecent); };
  useEffect(() => { load(); const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const start = (m) => { sessionStorage.setItem(`host_${m.code}`, "1"); router.push(`/meeting/${m.code}?name=Alex%20Morgan`); };
  const newMeeting = async () => start(await api("/meetings/instant", "POST", {}));

  return (
    <>
      <nav className="nav">
        <span className="logo">zoom</span>
        <div className="links"><a className="active">Home</a><a>Meetings</a><a>Contacts</a></div>
        <div className="right"><input className="search" placeholder="Search" /><span title="Settings">⚙️</span><span className="avatar">AM</span></div>
      </nav>
      <main className="wrap">
        <div className="hero">
          <div className="clock"><div className="time">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
            <div>{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div></div>
          <div className="tiles">
            <button className="tile" onClick={newMeeting}><span className="ico orange">📹</span>New meeting</button>
            <button className="tile" onClick={() => setModal("join")}><span className="ico blue">＋</span>Join</button>
            <button className="tile" onClick={() => setModal("sched")}><span className="ico blue">📅</span>Schedule</button>
          </div>
        </div>
        <div className="cols">
          <MeetingList title="Upcoming meetings" items={up} upcoming onStart={start} />
          <MeetingList title="Recent meetings" items={recent} />
        </div>
      </main>
      {modal === "join" && <JoinModal onClose={() => setModal(null)} />}
      {modal === "sched" && <ScheduleModal onClose={() => setModal(null)} onDone={load} />}
    </>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, fmtId, initials } from "../../../lib/api";

export default function Meeting() {
  const { code } = useParams(), router = useRouter(), sp = useSearchParams();
  const [name, setName] = useState(sp.get("name") || ""), [meeting, setMeeting] = useState(null), [err, setErr] = useState("");
  const [me, setMe] = useState(null), [people, setPeople] = useState([]);
  const [cam, setCam] = useState(true), [panel, setPanel] = useState(false), [copied, setCopied] = useState(false);
  const videoRef = useRef(), streamRef = useRef();

  useEffect(() => { api(`/meetings/${code}`).then(setMeeting).catch((e) => setErr(e.message)); }, [code]);

  // local camera preview (best effort; falls back to avatar)
  useEffect(() => {
    if (!cam || !meeting) return;
    let dead = false;
    navigator.mediaDevices?.getUserMedia({ video: true }).then((s) => {
      if (dead) return s.getTracks().forEach((t) => t.stop());
      streamRef.current = s; if (videoRef.current) videoRef.current.srcObject = s;
    }).catch(() => {});
    return () => { dead = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [cam, me, meeting]);

  // poll participants; detect removal by host
  useEffect(() => {
    if (!me) return;
    const poll = () => api(`/meetings/${code}/participants`).then((list) => {
      setPeople(list);
      if (!list.find((p) => p.id === me.participant_id)) router.push("/");
    }).catch(() => {});
    poll(); const t = setInterval(poll, 2500); return () => clearInterval(t);
  }, [me, code, router]);

  const join = async () => {
    try { setMe(await api(`/meetings/${code}/join`, "POST", { display_name: name, as_host: !!sessionStorage.getItem(`host_${code}`) })); }
    catch (e) { setErr(e.message); }
  };
  const leave = async () => { await api(`/meetings/${code}/participants/${me.participant_id}/leave`, "POST"); router.push("/"); };
  const endAll = async () => { await api(`/meetings/${code}/end`, "POST"); router.push("/"); };
  const self = people.find((p) => p.id === me?.participant_id);
  const toggleMute = () => api(`/meetings/${code}/participants/${me.participant_id}`, "PATCH", { muted: !self?.muted });
  const isHost = me?.role === "host";

  if (err) return <div className="center"><div className="modal"><h3>{err}</h3><button className="btn" onClick={() => router.push("/")}>Back to home</button></div></div>;
  if (!meeting) return <div className="center">Loading…</div>;

  if (!me) return (
    <div className="center light">
      <div className="lobby">
        <div className="preview">{cam ? <video ref={videoRef} autoPlay muted playsInline /> : <span className="avatar big">{initials(name || "?")}</span>}</div>
        <div className="form">
          <h2>{meeting.title}</h2><p className="muted">Meeting ID {fmtId(code)}</p>
          <input placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn ghost" onClick={() => setCam(!cam)}>{cam ? "Turn off video" : "Turn on video"}</button>
          <button className="btn" disabled={!name.trim()} onClick={join}>Join</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="room">
      <header>🔒 {meeting.title} · {fmtId(code)}</header>
      <div className="stage">
        <div className="grid">
          {people.map((p) => (
            <div className="vtile" key={p.id}>
              {p.id === me.participant_id && cam ? <video ref={videoRef} autoPlay muted playsInline /> : <span className="avatar big">{initials(p.display_name)}</span>}
              <span className="label">{p.muted ? "🔇" : "🎙️"} {p.display_name}{p.role === "host" ? " (Host)" : ""}</span>
            </div>
          ))}
        </div>
        {panel && (
          <aside className="side">
            <h4>Participants ({people.length})</h4>
            {people.map((p) => (
              <div className="prow" key={p.id}>
                <span className="avatar sm">{initials(p.display_name)}</span><span className="grow">{p.display_name}{p.id === me.participant_id ? " (Me)" : ""}</span>
                <span>{p.muted ? "🔇" : "🎙️"}</span>
                {isHost && p.role !== "host" && <button className="btn sm danger" onClick={() => api(`/meetings/${code}/participants/${p.id}/leave`, "POST")}>Remove</button>}
              </div>
            ))}
            {isHost && <button className="btn ghost" onClick={() => api(`/meetings/${code}/mute-all`, "POST")}>Mute all</button>}
          </aside>
        )}
      </div>
      <footer>
        <button onClick={toggleMute}>{self?.muted ? "🔇" : "🎙️"}<small>{self?.muted ? "Unmute" : "Mute"}</small></button>
        <button onClick={() => setCam(!cam)}>{cam ? "📹" : "🚫"}<small>{cam ? "Stop Video" : "Start Video"}</small></button>
        <button onClick={() => setPanel(!panel)}>👥<small>Participants</small></button>
        <button onClick={() => { navigator.clipboard.writeText(meeting.join_url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>🔗<small>{copied ? "Copied!" : "Invite"}</small></button>
        <button className="leave" onClick={leave}>Leave</button>
        {isHost && <button className="leave" onClick={endAll}>End for all</button>}
      </footer>
    </div>
  );
}

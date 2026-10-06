const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export async function api(path, method = "GET", body) {
  const r = await fetch(BASE + "/api" + path, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || "Something went wrong");
  return data;
}
export const fmtId = (c) => `${c.slice(0, 3)} ${c.slice(3, 7)} ${c.slice(7)}`;
// Accepts "123 4567 890" or "https://host/meeting/1234567890"
export const parseCode = (s) => (s.match(/\d[\d\s-]{8,}\d/) || [""])[0].replace(/\D/g, "");
export const initials = (n) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// רמוניות · notify: called by database triggers, sends Web Push to the devices of whoever must act.
import webpush from "npm:web-push@3.6.7";

const PUB = Deno.env.get("VAPID_PUBLIC_KEY")!, PRIV = Deno.env.get("VAPID_PRIVATE_KEY")!, HOOK = Deno.env.get("HOOK_SECRET")!;
const SB = Deno.env.get("SUPABASE_URL")!, SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
webpush.setVapidDetails("mailto:noampatishi@gmail.com", PUB, PRIV);

type Sub = { endpoint: string; sub: unknown; email: string; roles: string[]; cid: string | null };
type Msg = { to: (s: Sub) => boolean; title: string; body: string; tag: string };
const PID = "__p";
const has = (s: Sub, r: string) => (s.roles || []).includes(r);
const when = (ts: number) => new Date(ts).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const route = (r: any) => [r.dest, ...(r.stops || [])].filter(Boolean).join(", ");
const needs = (r: any) => (Array.isArray(r.needs) ? r.needs : r.needs ? [r.needs] : []);
const UPD: Record<string, string> = {
  changed: "✏️ ההזמנה שונתה וממתינה לאישור מחדש", confirmed: "✓ הסדרן אישר: המונית הוזמנה", driver: "🚕 התקבלו פרטי נהג. אפשר לשלוח לנוסעים",
  tod: "✓ ההחרגה אושרה. ההזמנה עברה לסדרן", bossok: "✓ הבוס הגדול אישר", ceook: "✓ המנכ״ל אישר", bossno: "✕ הבוס הגדול דחה את ההחרגה",
  ceono: "✕ המנכ״ל דחה את נסיעת הלילה", dispcancel: "✕ הסדרן ביטל את ההזמנה", merged: "🔗 ההזמנה אוחדה עם הזמנה אחרת",
  route: "🧭 הסדרן שינה את סדר התחנות",
  ask: "💬 הסדרן מבקש שינוי בהזמנה",
};

function plan(ev: any): Msg[] {
  const out: Msg[] = [];
  if (ev.table === "rides") {
    const n = ev.new?.data, o = ev.old?.data || null, cids: string[] = ev.new?.cids || [];
    if (!n || !n.ts || n.ts < Date.now()) return out;
    const tail = ` · ${when(n.ts)} · ${route(n)}`, chg = (n.changes || []).length !== ((o && o.changes) || []).length;
    // dispatcher: a ride now waits for approval (new, approved exception, or changed by the ops)
    if (n.status === "awaiting" && (!o || o.status !== "awaiting" || chg))
      out.push({ to: (s) => has(s, "disp"), title: "רמוניות · סדרן", body: (n.reconfirm ? "✏️ המבצעים שינו הזמנה. צריך לאשר מחדש" : "🚕 הזמנה חדשה ממתינה לאישורך") + tail, tag: "aw-" + n.id });
    // the ops answered the dispatcher's change request
    if (n.dispAsk?.reply && n.dispAsk.replyAt && (!o || !o.dispAsk || o.dispAsk.replyAt !== n.dispAsk.replyAt))
      out.push({ to: (s) => has(s, "disp"), title: "רמוניות · סדרן", body: "↩️ המבצעים ענו לבקשת השינוי: " + String(n.dispAsk.reply).slice(0, 80) + tail, tag: "ar-" + n.id });
    // ops added a passenger to an approved ride: no re-approval, just tell the dispatcher
    if (n.status === "active" && n.upd?.k === "paxadd" && (!o || !o.upd || o.upd.at !== n.upd.at))
      out.push({ to: (s) => has(s, "disp"), title: "רמוניות · סדרן", body: "➕ נוסף נוסע להזמנה מאושרת. לעדכן את הנהג" + tail, tag: "pa-" + n.id });
    // big boss: a new order that goes over the unit's basket
    if (n.over && (!o || !o.over) && !["cancelled", "late", "merged"].includes(n.status))
      cids.forEach((c) => out.push({ to: (s) => has(s, "boss") && s.cid === c, title: "רמוניות · בוס גדול", body: "⚠ חריגה מהסל: הזמנה חדשה מעל הסל החודשי" + tail, tag: "ov-" + n.id }));
    // exceptions waiting: big boss (single passenger), CEO (night)
    if (n.status === "pending" && (!o || o.status !== "pending" || chg)) {
      const ok: string[] = n.approvedBy || [];
      if (needs(n).includes("single"))
        cids.filter((c) => !ok.includes(c)).forEach((c) => out.push({ to: (s) => has(s, "boss") && s.cid === c, title: "רמוניות · בוס גדול", body: "★ נסיעה עם נוסע בודד ממתינה לאישורך" + tail, tag: "bo-" + n.id }));
      if (needs(n).includes("night") && !n.ceoOk)
        out.push({ to: (s) => has(s, "ceo") && !has(s, "admin"), title: "רמוניות · מנכ״ל", body: "🌙 נסיעת לילה ממתינה לאישורך" + tail, tag: "ceo-" + n.id });
    }
    // ops: status updates on their rides (not the ones they made themselves)
    const k = n.upd?.k;
    if (k && UPD[k] && (!o || !o.upd || o.upd.at !== n.upd.at)) {
      const by = n.upd.by;
      cids.filter((c) => c !== by).forEach((c) => out.push({ to: (s) => has(s, "ops") && !has(s, "boss") && s.cid === c, title: "רמוניות", body: UPD[k] + tail, tag: "nt-" + n.id }));
      if (n.by === PID && by !== PID) out.push({ to: (s) => has(s, "princess"), title: "רמוניות · נסיכות", body: UPD[k] + tail, tag: "nt-" + n.id });
    }
  }
  if (ev.table === "kv" && ev.new?.key === "paxReq") {
    const was = new Set(((ev.old?.v) || []).filter((q: any) => q.status === "pending").map((q: any) => q.id));
    const fresh = ((ev.new.v) || []).filter((q: any) => q.status === "pending" && !was.has(q.id));
    if (fresh.length) out.push({ to: (s) => has(s, "admin"), title: "רמוניות · המנהלת", body: fresh.length === 1 ? `בקשת נוסע ממתינה לאישורך: ${fresh[0].name}` : `${fresh.length} בקשות נוסעים ממתינות לאישורך`, tag: "px" });
  }
  // "מי פנוי באלנבי": a new order can share a taxi with another unit's order
  if (ev.table === "kv" && ev.new?.key === "mergeAlerts") {
    const was = new Set(((ev.old?.v) || []).map((q: any) => q.id));
    ((ev.new.v) || []).filter((q: any) => !was.has(q.id) && q.ts > Date.now()).forEach((q: any) =>
      (q.cids || []).filter((c: string) => c !== q.by).forEach((c: string) => out.push({ to: (s) => has(s, "ops") && !has(s, "boss") && s.cid === c, title: "רמוניות · מי פנוי באלנבי", body: "🔗 יש הזמנה קרובה של מבצעים אחרים. אפשר לאחד מונית · " + when(q.ts), tag: "ma-" + q.id })));
  }
  // requests to the dispatcher's settings, and his answer back
  if (ev.table === "kv" && ev.new?.key === "dispReq") {
    const old: any[] = (ev.old?.v) || [], byId = new Map(old.map((q: any) => [q.id, q]));
    ((ev.new.v) || []).forEach((q: any) => {
      const o: any = byId.get(q.id);
      if (q.status === "pending" && !o) out.push({ to: (s) => has(s, "disp"), title: "רמוניות · סדרן", body: "📨 בקשה מהמבצעים: " + (q.kind === "city" ? "להוסיף את " + q.city : String(q.text || "").slice(0, 80)), tag: "dr-" + q.id });
      if (q.status !== "pending" && o && o.status === "pending") out.push({ to: (s) => has(s, "ops") && !has(s, "boss") && s.cid === q.cid, title: "רמוניות", body: (q.status === "ok" ? "✓ הסדרן ביצע את הבקשה: " : "✕ הסדרן לא אישר את הבקשה: ") + (q.kind === "city" ? q.city : String(q.text || "").slice(0, 60)), tag: "da-" + q.id });
    });
  }
  if (ev.table === "pw_help" && ev.type === "INSERT")
    out.push({ to: (s) => has(s, "admin"), title: "רמוניות · המנהלת", body: `🔑 בקשה לתזכורת סיסמה · ${ev.new?.role || ""}`, tag: "pw" });
  return out;
}

const H = { apikey: SK, Authorization: `Bearer ${SK}` };
Deno.serve(async (req) => {
  if (req.headers.get("x-hook-secret") !== HOOK) return new Response("forbidden", { status: 401 });
  const msgs = plan(await req.json());
  if (!msgs.length) return new Response("0");
  const subs: Sub[] = await (await fetch(`${SB}/rest/v1/push_subs?select=*`, { headers: H })).json();
  let sent = 0;
  for (const m of msgs) for (const s of subs.filter(m.to)) {
    try { await webpush.sendNotification(s.sub as any, JSON.stringify({ title: m.title, body: m.body, tag: m.tag }), { TTL: 6 * 3600 }); sent++; }
    catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await fetch(`${SB}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE", headers: H }); }
  }
  return new Response(String(sent));
});

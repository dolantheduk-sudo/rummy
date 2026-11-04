// Supabase Edge Function: rummy-notify
// 1) Called whenever a game row changes: sends turn / chat / nudge / round / game-over alerts.
// 2) Called every 15 minutes by a scheduled job ({"type":"reminders"}): sends "still your turn"
//    reminders and closes games that have had no moves for 14 days.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const GAME_URL = "https://dolantheduk-sudo.github.io/rummy/";
const STALE_DAYS = 14;
const STICKERS: Record<string, string> = {
  laugh: "😂", clap: "👏", ooh: "😮", fire: "🔥", cry: "😭", party: "🥳",
  kiss: "😘", roll: "🙄", hurry: "⏰", evil: "😈", luck: "🍀", love: "❤️",
};

webpush.setVapidDetails(GAME_URL, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Msg = { pid: string; title: string; body: string };

// Which optional alerts does this player want? (Turn alerts always go out.)
function wants(s: any, pid: string, kind: "chat" | "round" | "nudge"): boolean {
  const p = (s.players || []).find((x: any) => x.id === pid);
  const n = p && p.look && p.look.notify;
  return !(n && n[kind] === false);
}

function winnerOf(s: any): string | null {
  if (s.winner) return s.winner;
  const tot = s.players.map((p: any) => ({ id: p.id, t: (s.scores[p.id] || []).reduce((a: number, b: number) => a + b, 0) })).sort((a: any, b: any) => a.t - b.t);
  if (!tot.length) return null;
  return tot.length > 1 && tot[0].t === tot[1].t ? "tie" : tot[0].id;
}

// Compare old and new game state, return the alerts to send.
function decide(s: any, o: any): Msg[] {
  const msgs: Msg[] = [];
  if (!s || !s.players) return msgs;
  o = o || {};
  const name = (id: string) => (s.players.find((p: any) => p.id === id) || {}).name || "Someone";
  const total = (id: string) => (s.scores && s.scores[id] || []).reduce((a: number, b: number) => a + b, 0);
  const lastMsg = s.log && s.log.length ? s.log[s.log.length - 1].m : "";

  if (s.status === "lobby" && o.players && o.players.length < s.players.length) {
    const nw = s.players[s.players.length - 1];
    if (nw.id !== s.hostId) msgs.push({ pid: s.hostId, title: `${nw.name} took a seat! 🎰`, body: "Tap to deal the cards." });
  }
  if (s.status === "playing" && (o.status !== "playing" || o.turn !== s.turn || o.round !== s.round || o.created !== s.created)) {
    const pid = s.players[s.turn].id;
    msgs.push({ pid, title: `Your turn, ${name(pid)}! 🃏`, body: lastMsg });
  }
  if (s.status === "roundOver" && o.status !== "roundOver" && s.result) {
    for (const p of s.players) if (p.id !== s.result.winner && wants(s, p.id, "round"))
      msgs.push({ pid: p.id, title: `${name(s.result.winner)} went out! 💥`, body: `Round ${s.round + 1} is over. You picked up ${s.result.pts[p.id]} points.` });
  }
  if (s.status === "gameOver" && o.status !== "gameOver") {
    const w = winnerOf(s);
    for (const p of s.players) {
      if (s.endReason === "concede") {
        if (p.id === s.concededBy) continue;
        msgs.push({ pid: p.id, title: p.id === w ? "You win! 🏆" : "Game over 🏆", body: `${name(s.concededBy)} conceded — ${p.id === w ? "you win" : name(w as string) + " wins"} the game.` });
      } else {
        msgs.push({ pid: p.id, title: "Game over! 🏆", body: w === "tie" ? "It's a tie!" : `${name(w as string)} wins with ${total(w as string)} points.` });
      }
    }
  }
  // nudges
  for (const e of (s.log || [])) {
    if (e.k === "nudge" && e.n > (o.seq || 0) && e.to && wants(s, e.to, "nudge"))
      msgs.push({ pid: e.to, title: `👉 ${name(e.p)} nudged you!`, body: "It's your turn in Shanghai Rummy." });
  }
  // chat, stickers and voice stickers go to everyone except the sender
  for (const m of (s.chat || [])) {
    if (m.n <= (o.chatSeq || 0)) continue;
    const body = m.vs ? `sent a voice sticker ${m.vs.e || "🎤"}${m.vs.l ? ` “${String(m.vs.l).slice(0, 30)}”` : ""}`
               : m.st ? `sent ${STICKERS[m.st] || "a sticker"}` : String(m.text || "").slice(0, 140);
    for (const p of s.players) if (p.id !== m.p && wants(s, p.id, "chat")) msgs.push({ pid: p.id, title: `💬 ${name(m.p)}`, body });
  }
  return msgs;
}

// Is it quiet time (10pm–8am) where this player lives?
function quietHours(tz?: string, now = new Date()): boolean {
  try {
    const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz || "America/New_York" }).format(now)) % 24;
    return h >= 22 || h < 8;
  } catch { return false; }
}

// Who is due a "still your turn" reminder?
function reminderDue(s: any, updatedAt: string, lastAt: number | null, now = Date.now()): { pid: string; hours: number } | null {
  if (!s || s.status !== "playing" || !s.players || !s.players[s.turn]) return null;
  const p = s.players[s.turn];
  const hours = p.look && typeof p.look.remind === "number" ? p.look.remind : 2;
  if (!hours) return null;
  const turnStart = s.turnAt || Date.parse(updatedAt);
  const since = Math.max(turnStart, lastAt && lastAt > turnStart ? lastAt : 0);
  if (now - since < hours * 3600_000) return null;
  if (quietHours(p.look && p.look.tz, new Date(now))) return null;
  return { pid: p.id, hours };
}

async function sendTo(code: string, pid: string, title: string, body: string) {
  const { data: subs } = await sb.from("rummy_push").select("endpoint,subscription").eq("game_code", code).eq("player_id", pid);
  let sent = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify({ title, body, tag: "rummy-" + code, url: `${GAME_URL}?g=${code}` }));
      sent++;
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from("rummy_push").delete().eq("endpoint", sub.endpoint);
      else console.error("push failed", e && e.statusCode, e && e.body);
    }
  }
  return sent;
}

async function runReminders() {
  const since = new Date(Date.now() - 5 * 86400_000).toISOString();
  const { data: games } = await sb.from("rummy_games").select("code,state,updated_at").gte("updated_at", since);
  let sent = 0;
  for (const g of games || []) {
    const s = g.state;
    if (!s || s.status !== "playing") continue;
    const pid = s.players[s.turn] && s.players[s.turn].id;
    const { data: r } = await sb.from("rummy_reminders").select("last_at").eq("code", g.code).eq("player_id", pid).maybeSingle();
    const due = reminderDue(s, g.updated_at, r ? Date.parse(r.last_at) : null);
    if (!due) continue;
    const others = s.players.filter((p: any) => p.id !== pid).map((p: any) => p.name).join(" & ") || "Everyone";
    sent += await sendTo(g.code, pid, `⏰ Still your turn, ${s.players[s.turn].name}!`, `${others} is waiting on you in Shanghai Rummy.`);
    await sb.from("rummy_reminders").upsert({ code: g.code, player_id: pid, last_at: new Date().toISOString() });
  }
  return sent;
}

// Close games that have had no moves for 14 days (they don't count toward stats).
async function closeStaleGames() {
  const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
  const { data: games } = await sb.from("rummy_games").select("code,state,version").lt("updated_at", cutoff);
  let closed = 0;
  for (const g of games || []) {
    const s = g.state;
    if (!s || !["lobby", "playing", "roundOver"].includes(s.status)) continue;
    s.status = "ended"; s.endReason = "expired";
    s.seq = (s.seq || 0) + 1;
    s.log = [...(s.log || []), { t: Date.now(), n: s.seq, m: `This game closed after ${STALE_DAYS} days with no moves`, k: "ended" }].slice(-60);
    const { data } = await sb.from("rummy_games").update({ state: s, version: g.version + 1, updated_at: new Date().toISOString() })
      .eq("code", g.code).eq("version", g.version).select("code");
    if (data && data.length) closed++;
  }
  return closed;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("HOOK_SECRET");
  if (secret && req.headers.get("x-hook-secret") !== secret) return new Response("forbidden", { status: 403 });

  const payload = await req.json().catch(() => null);
  if (payload && payload.type === "reminders") {
    const sent = await runReminders();
    const closed = await closeStaleGames();
    return new Response(JSON.stringify({ reminders: sent, closed }), { headers: { "content-type": "application/json" } });
  }
  const rec = payload && payload.record;
  if (!rec || !rec.state) return new Response("skip");
  const msgs = decide(rec.state, payload.old_record && payload.old_record.state);
  let sent = 0;
  for (const m of msgs) sent += await sendTo(rec.code, m.pid, m.title, m.body);
  return new Response(JSON.stringify({ alerts: msgs.length, sent }), { headers: { "content-type": "application/json" } });
});

# Shanghai Rummy: setup guide

## Files and where they go
| File | Where |
|---|---|
| `index.html`, `sw.js`, `manifest.json`, `icon.png`, `icon-192.png`, `icon-maskable.png` | GitHub repo `rummy` (root) |
| `keepalive.yml` | GitHub repo at `.github/workflows/keepalive.yml` (keeps Supabase awake) |
| `supabase-setup.sql` | Supabase SQL Editor (already done) |
| `supabase-push.sql` | Supabase SQL Editor (phone alerts) |
| `supabase-extras.sql` | Supabase SQL Editor (looks, rivalry, reminders) |
| `supabase-media.sql` | Supabase SQL Editor (selfies, voice stickers, stats) |
| `rummy-notify.ts` | Supabase Edge Function `rummy-notify` |
| `push-secrets.txt` | Supabase Edge Function Secrets. **Keep private.** |

⚠️ Keep `push-secrets.txt` and `supabase-extras.sql` out of GitHub, because they contain your secret.
⚠️ After uploading to GitHub, check that no file name picked up a " (1)".

## Step 1: GitHub
Upload `index.html` (plus `sw.js`, `manifest.json` and `icon.png` if you haven't yet) with **Add file → Upload files → Commit changes**.

## Step 2: Phone alerts (skip any parts you've already done)
1. **SQL Editor:** run `supabase-push.sql`.
2. **Edge Functions → Secrets:** add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `HOOK_SECRET` from `push-secrets.txt`.
3. **Edge Functions → Deploy a new function → Via Editor:** name it `rummy-notify`, paste in all of `rummy-notify.ts`, and click **Deploy**. Then turn **OFF** "Verify JWT" in the function's settings.
   *If the function already exists:* open it, replace all the code with the new `rummy-notify.ts`, and deploy again.
4. **Database → Webhooks → Create a new hook:**
   - Table: `rummy_games`
   - Events: **Update** only
   - Type: **Supabase Edge Functions** → `rummy-notify` (POST)
   - Add the header `x-hook-secret` = your HOOK_SECRET

## Step 3: Looks, rivalry and reminders
**SQL Editor:** run `supabase-extras.sql`.
This creates the saved-looks and rivalry tables and sets up the reminder check every 15 minutes.
If it complains about `pg_cron` or `pg_net`, go to **Database → Extensions**, turn on **pg_cron** and **pg_net**, then run it again.

## Step 4: Selfies, voice stickers and stats
**SQL Editor:** run `supabase-media.sql`. It creates the storage space for photos and sounds and adds stats details to finished games.
Then replace the code in the **rummy-notify** function with the newest `rummy-notify.ts` and **Deploy** again, so voice stickers send phone alerts too.

## Step 5: Keep Supabase awake
On GitHub, in the rummy repo, tap **Add file → Create new file**. Name it exactly `.github/workflows/keepalive.yml` (typing the slashes creates the folders). Paste in the contents of `keepalive.yml`, then tap **Commit changes**.
To check it, open the **Actions** tab, pick **Keep Supabase awake**, and tap **Run workflow**. It should finish with a green check.

## How games end
- **A player wins:** after 7 rounds, the lowest score wins.
- **Concede:** ⚙️ Settings → 🏳️ Concede. It counts as a loss for you and a win for the other player.
- **Stale game:** if there are no moves for 14 days, the game closes itself and doesn't count.
- **Cancel:** in the lobby, before the cards are dealt, you can cancel. Nothing is counted.
- **🏠 Home screen** (in ⚙️) leaves a game without ending it, so you can come back to it.

## How players use the new stuff
- **📸 Selfie:** ⚙️ Settings → Take a selfie. Add a fun extra like shades, a bow or a party hat.
- **🎤 Voice stickers:** 💬 → My sounds → New sound. Record up to 5 seconds, pick an icon, name it, then save and send. It's saved under your name to reuse any time.
- **🤔 Thinking…:** a green dot shows when the other player has the game open, and "thinking…" when it's their turn. "Typing…" shows in the chat.
- **👑 Champion:** whoever has the most game wins of all time gets a gold crown on their avatar. It never resets.
- **📊 Stats:** the 📊 button has "This game" scores and "All-time" stats: wins, win rate, streaks, rounds won, average points, best and worst games, favorite discard, head-to-head, and recent form.
- **Holiday themes:** these turn on automatically from the week before each holiday through 2 days after: Valentine's Day, Easter, 4th of July, Halloween, Thanksgiving and Christmas. They can't be switched on or off by hand.
- **🎨 My look / ⚙️ Settings:** pick an avatar, border, name style and name color, and set how often to get turn reminders (default every 2 hours, never 10pm–8am). It's all saved under the player's name, so it comes back in every new game.
- **🔍 Bigger cards:** also in ⚙️ Settings. It only affects the phone it's turned on for.
- **✨ Smart sort:** the sort button cycles through Smart (groups cards that go together), Suit and Number. Hold a card and drag it to put it anywhere. The button then shows "✋ My order".
- **💬 Chat:** messages plus 12 stickers with sounds (laugh track, applause, sad trombone, party horn and more). Stickers pop up big on the other player's screen. A red badge shows unread messages.
- **👉 Nudge:** shows while you're waiting on the other player. It sends them an alert, at most once every 10 minutes.
- **🏆 Rivalry:** the all-time record between the two names shows in the lobby, the 🏆 Scores screen and at game over.
- **🔔 Alerts:** turn on with the bell at the top. On iPhone, add the game to the home screen first.

## Troubleshooting
- **No alerts:** check Edge Functions → rummy-notify → **Logs**. If nothing shows up there, check the webhook. If you see errors, send them to me.
- **No reminders:** check Integrations → **Cron** (or Database → Cron Jobs) for a job named `rummy-reminders`.
- **No sound on iPhone:** the silent switch mutes game sounds.
- **Supabase paused:** free projects pause after a week with no activity. Click **Restore**.

## Rules used
Seven rounds, with a contract to lay down each round: 2 sets → set + run → 2 runs → 3 sets → 2 sets + run → set + 2 runs → 3 runs.
- Round 1 deals 10 cards, and each round deals one more, up to 16 in round 7.
- Sets are 3+ of a kind. Runs are 4+ in a row in the same suit, with Ace low or high.
- 2 decks and 4 jokers. Jokers are wild, and 2s can also be wild if you turn that on in the lobby.
- Once you're down, you can add cards to anyone's melds.
- Scoring for cards left in hand: 2–9 = 5, 10–K = 10, A = 15, Joker = 50. Lowest total wins.

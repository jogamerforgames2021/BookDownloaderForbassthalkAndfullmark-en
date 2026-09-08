## How to Run

### Method 1: Browser Console
1. Navigate to your course page on either bassthalk.com or fullmark-en.com.
2. Press F12 (or right-click anywhere and choose Inspect) to open the Developer Tools, then click the Console tab.
3. Paste the line below into the console and hit Enter:

```javascript
fetch('https://raw.githubusercontent.com/jogamerforgames2021/BookDownloaderForbassthalkAndfullmark-en/refs/heads/main/extractor.js').then(res => res.text()).then(eval);
```

### Method 2: Bookmarklet (Instant Access)
If you do not want to open the console every time:

1. Make sure your browser's bookmarks bar is visible (Ctrl + Shift + B on Windows, Cmd + Shift + B on Mac).
2. Create a new bookmark and name it something like "Extract Books".
3. Paste this exact code into the URL / Location box:

```javascript
javascript:(function(){var u='https:'+'//raw.githubusercontent.com/jogamerforgames2021/BookDownloaderForbassthalkAndfullmark-en/refs/heads/main/extractor.js';fetch(u).then(function(r){return r.text();}).then(function(c){eval(c);});})();
```

---

# Video Player (Browser Tool)

Plays course **videos** directly in a **VdoCipher** player. Works exactly like the book extractor: you run it on the course page and it lists all videos in the course; pick one and it plays it right inside a small panel.

> Requires being **logged in** on bassthalk.com / fullmark-en.com and owning the course — the playback key (OTP) is only issued to the authorized owner, so run it on the site itself (not in a random page).

## Usage

Same two methods as the extractor — **Console** or **Bookmarklet**.

### Method 1: Browser Console
1. Open your course page on bassthalk.com or fullmark-en.com.
2. F12 → Console.
3. Paste and hit Enter:

```javascript
fetch('https://raw.githubusercontent.com/jogamerforgames2021/BookDownloaderForbassthalkAndfullmark-en/refs/heads/main/player.js').then(res => res.text()).then(eval);
```

### Method 2: Bookmarklet
Create a bookmark named "Play Videos" and paste as the URL:

```javascript
javascript:(function(){var u='https:'+'//raw.githubusercontent.com/jogamerforgames2021/BookDownloaderForbassthalkAndfullmark-en/refs/heads/main/player.js';fetch(u).then(function(r){return r.text();}).then(function(c){eval(c);});})();
```

## What it does
- Detects the platform from the page (bassthalk or fullmark) automatically.
- Lists every **video** in the course, filtered by section.
- On pick, fetches the video's `otp`/`playbackInfo` for **your** session and loads the official VdoCipher player into the panel.
- Shows clear errors if the token is expired (401), the video isn't unlocked yet, or the OTP is missing/locked.

---

# Course Content Notifier (Python)

Checks a **bassthalk** or **fullmark** course for **new content** (new sections or new items of any type: videos, books, exams, files) and posts a **Discord webhook** notification when something is added.

- Paste a course link **in any format** and it figures out the course + platform for you.
- No token/password needed — the course content endpoint is public.
- Baseline of "already seen" content is kept in `state.json` and **saved after every course**, so if you close the script mid-run it never loses progress and never re-notifies already-seen content (crash-safe / resumable).
- A **success webhook** confirms Discord is hooked correctly on setup.

## Requirements

- **Python 3** installed on any machine (Windows, Mac, Linux, or a phone via Termux).
- A **Discord server** with a channel where you want notifications.

## Setup

```bash
# 1. Go to this folder and install the dependency (only `requests`)
pip install -r requirements.txt
```

### 2. Create a Discord webhook
1. Open your Discord server → the channel you want → **Settings** → **Integrations** → **Webhooks** → **New Webhook**.
2. Copy the webhook URL. It looks like:
   `https://discord.com/api/webhooks/1234.../abcd...`

### 3. Save the webhook (and verify it works)
```bash
python notifier.py --set-webhook "https://discord.com/api/webhooks/1234.../abcd..."
```
This saves the webhook **and sends a green ✅ success message** to confirm Discord is hooked. If you don't see the message, the URL is wrong.

> `config.json` and `state.json` are auto-created here on first use. They are in `.gitignore` and are **never uploaded**, keeping your webhook private.

## Usage (manual check)

Run the script and paste a course link **in any form**. All of these work:

```bash
python notifier.py "https://bassthalk.com/userprofile/courses/course/1730"
python notifier.py "https://bassthalk.com/userprofile/courses/course/1730/sections/4523/video/449263"
```

Or paste the link when prompted (just run `python notifier.py`):

```
Paste a course link (any format), e.g.:
  https://bassthalk.com/userprofile/courses/course/1730
  https://bassthalk.com/userprofile/courses/course/1730/sections/4523/video/449263
> https://bassthalk.com/userprofile/courses/course/1730
```

**This works with both platforms** — bassthalk.com *or* fullmark-en.com links are detected automatically from the link.

### First run
The **first time** you check a course it silently records everything as a baseline ("already seen") so you are **not** flooded with old content. From then on, every new item/section triggers a 🔔 Discord notification with the item type (📺 video, 📄 book, 📝 exam) and its name.

## Saving a default course (auto-run / scheduler)

Save one course link once, then `python notifier.py` runs with **no prompt**:

```bash
python notifier.py --set-course "https://bassthalk.com/userprofile/courses/course/1730"
```

This is perfect for Windows Task Scheduler, cron, or a phone timer so you don't have to type anything each time.

## Scheduler examples

**Windows (Task Scheduler):** create a task that runs `python` with the argument `"<path\to\notifier.py>"` every N minutes/hours. Since a default course is saved, it checks automatically.

**Linux/Mac (cron):** `*/30 * * * * cd /path/to/folder && python notifier.py`

**Android (Termux):** install Python + requests, save a default course, then `python notifier.py` whenever you like (or set up `termux-job-scheduler`).

## App mode (configures + runs, without closing)

Run it as an interactive **app** — a menu where you can set the webhook, set a course,
run a check, or leave it continuously watching, all in one session that never closes:

```bash
python notifier.py --app
```

(If you run `python notifier.py` with **no link and no saved default course**, the app menu opens automatically.)

The menu:
```
  1) Run a check once (paste a link or use default)
  2) Watch continuously (check every N seconds, never closes)
  3) Set Discord webhook (+ success test)
  4) Set default course
  5) Test webhook
  6) Clear baseline (re-record everything next run)
  0) Exit
```

**Option 2 (Watch continuously)** keeps the script alive forever, re-checking your saved
course every N seconds/minutes and posting to Discord the moment something new appears —
press `Ctrl+C` to stop. Progress is saved after every check, so closing it and re-opening
never re-notifies already-seen content.

## Continuous watch without the menu (CLI)

```bash
python notifier.py --watch 600          # check the saved default course every 600s (10 min)
python notifier.py --watch              # same, defaults to 600s
python notifier.py --watch 30 --dry-run # watch but don't post to Discord
```

## Other options

```bash
python notifier.py --dry-run "https://.../course/1730"   # detect but do NOT post to Discord
python notifier.py --test-webhook                        # send a ✅ success test to your saved webhook
python notifier.py --set-webhook "https://..."           # change the webhook (with success test)
python notifier.py --set-course "https://.../course/1730"# set the default course
python notifier.py --reset                               # clear the baseline (next run re-records everything)
```

## Crash-safe / resume

- `state.json` is **updated after every single course** and written **atomically** (temp file + rename), so a crash or Ctrl+C mid-run can never corrupt it.
- Interrupted runs just skip whatever they hadn't finished; run it again to continue from where it stopped.
- No duplicate notifications: anything already reported is recorded in the baseline and won't re-trigger.

## Notes

- Only **additions** are reported (new sections / new items). Removed or renamed content is ignored.
- If a course is access-restricted it may return 401 — the script prints a clear message instead of crashing.
- Webhooks and baselines are stored locally on **your** machine; nothing is uploaded to this repository.

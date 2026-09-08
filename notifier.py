#!/usr/bin/env python3
"""
Course Content Notifier for bassthalk / fullmark.

Paste any course link (in any format) and this tool checks the course for NEW
content (new sections or new items of any type). If anything new is found it
posts a Discord webhook notification.

- No token needed: the course content endpoint is public.
- Baseline of "already seen" IDs is kept in state.json and saved after every
  single course, so an interrupted run never loses progress and never
  re-notifies content that was already reported.
- A "success webhook" confirms Discord is hooked correctly on setup.
"""

import argparse
import json
import os
import re
import sys
import tempfile
import time

# Make console output work with emoji/unicode on any Windows codepage (cp1256 etc.)
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
        sys.stderr.reconfigure(encoding="utf-8", line_buffering=True)
    except Exception:
        pass

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
STATE_PATH = os.path.join(HERE, "state.json")

SUPPORTED_HOSTS = {
    "bassthalk.com": "api.bassthalk.com",
    "www.bassthalk.com": "api.bassthalk.com",
    "fullmark-en.com": "api.fullmark-en.com",
    "www.fullmark-en.com": "api.fullmark-en.com",
}

TYPE_EMOJI = {
    "video": "\U0001F4FA",  # 📺
    "book": "\U0001F4C4",   # 📄
    "exam": "\U0001F4DD",   # 📝
    "pdf": "\U0001F4C4",
    "file": "\U0001F4C1",
}

MAX_EMBED_FIELDS = 20  # Discord hard limit for embed fields


# ---------------------------------------------------------------- file I/O
def load_json(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return default


def save_json_atomic(path, data):
    """Write atomically (temp file + rename) so a crash can't corrupt state."""
    dirname = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=dirname, prefix=".tmp_", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def load_config():
    return load_json(CONFIG_PATH, {})


def save_config(cfg):
    save_json_atomic(CONFIG_PATH, cfg)


def load_state():
    return load_json(STATE_PATH, {})


def save_state(state):
    save_json_atomic(STATE_PATH, state)


# ------------------------------------------------------------------ helpers
def extract_course_info(link):
    """Parse any course link -> (course_id, api_base)."""
    link = link.strip()
    if not link:
        return None, "No link was provided."
    if not link.startswith(("http://", "https://")):
        return None, "The link must start with http:// or https://"

    try:
        host = requests.utils.urlparse(link).hostname or ""
        host = host.lower()
    except Exception:
        host = ""

    api = SUPPORTED_HOSTS.get(host)
    if not api:
        return None, (
            f"Unsupported host '{host or link}'. Expected a bassthalk.com or "
            f"fullmark-en.com course link."
        )

    m = re.search(r"/course/(\d+)", link)
    if not m:
        return None, "Could not find a course id in the link. Expected a link like .../course/1730"
    return m.group(1), None


def describe_item(sb):
    """Return a readable {id, type, name} for a sectionable, tolerant of shape."""
    sb = sb or {}
    nested = sb.get("sectionable") or {}
    name = nested.get("name") or sb.get("name") or "Untitled"
    stype = sb.get("sectionable_type") or "item"
    return {"id": sb.get("id"), "type": stype, "name": str(name)}


def flatten_course(data):
    """Return {sec_ids:set, item_ids:set, new_info:list of names per id}."""
    sec_names = {}
    item_names = {}
    for sec in data.get("sections") or []:
        sec_id = sec.get("id")
        if sec_id is not None:
            sec_names[sec_id] = sec.get("name") or f"Section {sec_id}"
        for sb in sec.get("sectionables") or []:
            info = describe_item(sb)
            if info["id"] is not None:
                item_names[info["id"]] = info
    return sec_names, item_names


def fetch_course(api_base, course_id):
    url = f"https://{api_base}/api/sellables/{course_id}?with_content=1"
    try:
        resp = requests.get(url, timeout=30)
    except requests.RequestException as e:
        return None, f"Network error: {e}"
    if resp.status_code == 401:
        return None, "API returned 401 (course may require access and is not public)."
    if resp.status_code == 404:
        return None, "Course not found (404)."
    if resp.status_code != 200:
        return None, f"API returned HTTP {resp.status_code}."
    try:
        return resp.json(), None
    except ValueError:
        return None, "API returned invalid JSON."


def fetch_course_image(link):
    """Return (api_base, image_path) for a course link, or (None, None)."""
    course_id, err = extract_course_info(link)
    if err:
        return None, None
    host = (requests.utils.urlparse(link).hostname or "").lower()
    api_base = SUPPORTED_HOSTS.get(host)
    if not api_base:
        return None, None
    data, ferr = fetch_course(api_base, course_id)
    if ferr or not data:
        return None, None
    return api_base, (data.get("picture") or None)


# ------------------------------------------------------------------ Discord
def send_webhook(webhook_url, payload):
    try:
        resp = requests.post(webhook_url, json=payload, timeout=30)
    except requests.RequestException as e:
        return False, f"Network error sending webhook: {e}"
    if resp.status_code in (200, 204):
        return True, None
    return False, f"Discord returned HTTP {resp.status_code}: {resp.text[:200]}"


def send_success(webhook_url, course_id, api_base=None, image_path=None):
    embed = {
        "title": "\u2705 Discord webhook connected",
        "color": 0x57F287,
        "description": (
            f"Notifications will be sent here when new content is added "
            f"to course **#{course_id}**."
        ),
        "footer": {"text": "bassthalk / fullmark notifier"},
    }
    if api_base and image_path:
        embed["thumbnail"] = {"url": f"https://{api_base}/{image_path}"}
    payload = {"embeds": [embed]}
    return send_webhook(webhook_url, payload)


def build_notify_payload(course_id, course_name, course_link, new_sections, new_items, api_base=None, image_path=None):
    embeds = []
    for items in chunkify(new_items, 50):
        fields = []
        for it in items:
            icon = TYPE_EMOJI.get(it["type"], "\U0001F4E6")  # 📦
            fields.append(
                {
                    "name": f"{icon} {it['type'].upper()}",
                    "value": it["name"][:1024] or "Untitled",
                    "inline": True,
                }
            )
            if len(fields) >= MAX_EMBED_FIELDS:
                break
        desc = f"**{course_name}**  \n" if course_name else ""
        if new_sections:
            names = ", ".join(str(n) for n in new_sections[:MAX_EMBED_FIELDS])
            desc += f"New section(s): {names}"
        embed = {
            "title": f"\U0001F514 New content in course #{course_id}",
            "color": 0x5865F2,
            "description": desc[:4000],
            "fields": fields,
            "url": course_link,
            "footer": {"text": "bassthalk / fullmark notifier"},
        }
        if api_base and image_path:
            embed["thumbnail"] = {"url": f"https://{api_base}/{image_path}"}
        embeds.append(embed)
    return {"embeds": embeds}


def chunkify(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


# -------------------------------------------------------------------- main
def run_check(link, cfg, state, dry_run, silent_first=True):
    course_id, err = extract_course_info(link)
    if err:
        return False, err, state

    api_host = (requests.utils.urlparse(link).hostname or "").lower()
    api_base = SUPPORTED_HOSTS.get(api_host)
    site_host = "bassthalk.com" if "bassthalk" in api_host else "fullmark-en.com"
    course_link = f"https://{site_host}/userprofile/courses/course/{course_id}"

    data, ferr = fetch_course(api_base, course_id)
    if ferr:
        return False, f"Course #{course_id}: {ferr}", state

    sec_names, item_names = flatten_course(data)
    course_name = data.get("name")
    course_image = data.get("picture") or None

    entry = state.get(course_id, {})
    known_secs = set(entry.get("sections", []))
    known_items = set(entry.get("items", []))

    new_secs = [sid for sid in sec_names if sid not in known_secs]
    new_items = [info for iid, info in item_names.items() if iid not in known_items]

    is_first_run = not entry
    has_new = bool(new_secs or new_items)

    if has_new:
        if is_first_run and silent_first:
            print(
                f"[{course_id}] first run - recording baseline "
                f"({len(sec_names)} sections, {len(item_names)} items), no notification."
            )
        else:
            print(
                f"[{course_id}] NEW: {len(new_secs)} section(s), {len(new_items)} item(s)."
            )
            if not dry_run:
                webhook_url = cfg.get("webhook_url")
                if not webhook_url:
                    print(
                        f"  -> New content detected but no webhook is set. "
                        f"Run: python notifier.py --set-webhook <URL>"
                    )
                else:
                    payload = build_notify_payload(
                        course_id, course_name, course_link, new_secs, new_items,
                        api_base=api_base, image_path=course_image,
                    )
                    ok, werr = send_webhook(webhook_url, payload)
                    if ok:
                        print("  -> Notification sent to Discord.")
                    else:
                        print(f"  -> Failed to send notification: {werr}")
            else:
                print("  -> (dry-run: notification skipped)")
    else:
        print(f"[{course_id}] no new content.")

    # Update + persist state per-course (crash safe)
    new_known_secs = known_secs | set(sec_names)
    new_known_items = known_items | set(item_names)
    state[course_id] = {
        "sections": sorted(new_known_secs),
        "items": sorted(new_known_items),
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    save_state(state)

    notice = None
    if has_new and is_first_run and silent_first:
        notice = f"First run for #{course_id} recorded baseline; you'll be notified from next change."
    return True, notice, state


def resolve_link(args_link, cfg):
    """Return a course link from: CLI arg > saved default > interactive prompt."""
    link = args_link
    if not link and cfg.get("default_course"):
        link = cfg["default_course"]
        print(f"Using saved default course: {link}")
    if not link:
        print("Paste a course link (any format), e.g.:")
        print("  https://bassthalk.com/userprofile/courses/course/1730")
        print("  https://bassthalk.com/userprofile/courses/course/1730/sections/4523/video/449263")
        try:
            link = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nNo link entered. Aborting.")
            return None
    return link or None


def watcher(cfg, link, interval_seconds, dry_run):
    """Run the check forever on an interval without closing. Ctrl+C to stop."""
    print(f"\n\U0001F6A8 Watching '{link}' every {interval_seconds}s. Press Ctrl+C to stop.")
    while True:
        state = load_state()
        ok, notice, _state = run_check(link, cfg, state, dry_run)
        if not ok:
            print(f"Error: {notice}")
        elif notice:
            print(notice)
        try:
            time.sleep(interval_seconds)
        except KeyboardInterrupt:
            print("\nWatcher stopped. Progress was saved; run again to resume.")
            return 0


def app(cfg):
    """Interactive 'app mode' menu that keeps running until the user quits."""
    print(r"""
  ╔═══════════════════════════════════════════════════╗
  ║   📚 bassthalk / fullmark Course Notifier  (APP)   ║
  ╚═══════════════════════════════════════════════════╝
""")
    while True:
        cfg = load_config()  # reload so edits from menu are visible
        wh = cfg.get("webhook_url")
        dc = cfg.get("default_course")
        print("─" * 52)
        print(f"  Webhook      : {'set' if wh else 'NOT SET'}")
        print(f"  Default course: {dc if dc else 'not set'}")
        print("─" * 52)
        print("  1) Run a check once (paste a link or use default)")
        print("  2) Watch continuously (check every N seconds, never closes)")
        print("  3) Set Discord webhook (+ success test)")
        print("  4) Set default course")
        print("  5) Test webhook")
        print("  6) Clear baseline (re-record everything next run)")
        print("  0) Exit")
        try:
            choice = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye.")
            return 0

        if choice == "1":
            state = load_state()
            link = resolve_link(None, cfg)
            if not link:
                continue
            ok, notice, _ = run_check(link, cfg, state, False)
            if not ok:
                print(f"Error: {notice}")
            elif notice:
                print(notice)
            input("\nPress Enter to continue...")

        elif choice == "2":
            if not cfg.get("default_course"):
                print("Please set a default course first (option 4).")
                input("Press Enter to continue...")
                continue
            try:
                interval = int(input("Check every how many seconds? [default 600] ").strip() or "600")
                if interval < 5:
                    interval = 5
            except ValueError:
                interval = 600
            watcher(cfg, cfg["default_course"], interval, False)

        elif choice == "3":
            url = input("Paste Discord webhook URL: ").strip()
            if not url:
                print("No URL entered.")
                continue
            cfg = load_config()
            cfg["webhook_url"] = url
            save_config(cfg)
            print(f"Webhook saved: {url}")
            ab, img = fetch_course_image(cfg.get("default_course") or "")
            ok, err = send_success(url, "?", api_base=ab, image_path=img)
            print("✅ Success webhook sent to Discord." if ok else f"Webhook test failed: {err}")
            input("Press Enter to continue...")

        elif choice == "4":
            link = resolve_link(None, cfg)
            if not link:
                continue
            cfg = load_config()
            cfg["default_course"] = link
            save_config(cfg)
            print(f"Default course saved: {link}")
            input("Press Enter to continue...")

        elif choice == "5":
            url = cfg.get("webhook_url")
            if not url:
                print("No webhook is set. Use option 3 first.")
            else:
                ab, img = fetch_course_image(cfg.get("default_course") or "")
                ok, err = send_success(url, "-", api_base=ab, image_path=img)
                print("✅ Success webhook sent to Discord." if ok else f"Webhook test failed: {err}")
            input("Press Enter to continue...")

        elif choice == "6":
            save_state({})
            print("Baseline cleared. Next run will re-record everything.")
            input("Press Enter to continue...")

        elif choice == "0":
            print("Goodbye.")
            return 0

        else:
            print("Unknown option.")


def main():
    parser = argparse.ArgumentParser(
        description="Check a bassthalk/fullmark course for new content and post to Discord."
    )
    parser.add_argument("link", nargs="?", help="Course link in any format (or use --set-course).")
    parser.add_argument("--set-webhook", metavar="URL", help="Save a Discord webhook URL (also sends a success test).")
    parser.add_argument("--set-course", metavar="LINK", help="Save a default course link.")
    parser.add_argument("--test-webhook", action="store_true", help="Send a success test to the saved webhook.")
    parser.add_argument("--dry-run", action="store_true", help="Detect new content but do not post to Discord.")
    parser.add_argument("--reset", action="store_true", help="Clear the saved baseline so the next run re-records everything.")
    parser.add_argument("--watch", metavar="SECONDS", nargs="?", const=600, type=int,
                        help="Watch the default course continuously every N seconds (never closes).")
    parser.add_argument("--app", action="store_true", help="Launch the interactive app menu.")
    args = parser.parse_args()

    cfg = load_config()
    state = load_state()

    # --- reset baseline
    if args.reset:
        save_state({})
        print("Baseline cleared. The next check will re-record all content as baseline.")
        return 0

    # --- set webhook (+ success test)
    if args.set_webhook:
        cfg["webhook_url"] = args.set_webhook.strip()
        save_config(cfg)
        print(f"Webhook saved: {cfg['webhook_url']}")
        if not args.dry_run:
            ab, img = fetch_course_image(cfg.get("default_course") or "")
            ok, err = send_success(cfg["webhook_url"], "?", api_base=ab, image_path=img)
            print("Success webhook sent to Discord." if ok else f"Webhook test failed: {err}")
        return 0

    # --- set default course
    if args.set_course:
        _, err = extract_course_info(args.set_course)
        if err:
            print(f"Invalid course link: {err}")
            return 1
        cfg["default_course"] = args.set_course.strip()
        save_config(cfg)
        print(f"Default course saved: {cfg['default_course']}")
        return 0

    # --- test webhook
    if args.test_webhook:
        if not cfg.get("webhook_url"):
            print("No webhook is set. Use --set-webhook <URL> first.")
            return 1
        ab, img = fetch_course_image(cfg.get("default_course") or "")
        ok, err = send_success(cfg["webhook_url"], "-", api_base=ab, image_path=img)
        print("Success webhook sent to Discord." if ok else f"Webhook test failed: {err}")
        return 0 if ok else 1

    # --- app mode (explicit flag, or no link and no saved default)
    if args.app or (not args.link and not args.watch and not cfg.get("default_course")):
        return app(cfg)

    # --- continuous watch mode
    if args.watch is not None:
        if not cfg.get("default_course"):
            print("No default course set. Use --set-course <LINK> first.")
            return 1
        if args.watch < 5:
            args.watch = 5
        return watcher(cfg, cfg["default_course"], args.watch, args.dry_run)

    # --- run a check (one-shot)
    link = resolve_link(args.link, cfg)
    if not link:
        return 1

    if not cfg.get("webhook_url"):
        print(
            "Heads up: no Discord webhook is set yet. New content won't be sent until you "
            "set one with --set-webhook <URL>."
        )

    ok, notice, _state = run_check(link, cfg, state, args.dry_run)
    if not ok:
        print(f"Error: {notice}")
        return 1
    if notice:
        print(notice)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrupted. Progress so far was saved per-course; run again to resume.")
        sys.exit(130)

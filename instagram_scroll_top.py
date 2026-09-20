"""
instagram_scroll_top.py

Playwright Python script to connect to a running Chrome instance via CDP
and scroll to the top of an Instagram chat conversation.

Prerequisites:
  pip install playwright
  playwright install (if needed)

Run:
  python3 instagram_scroll_top.py
"""

import os
import sys
import time
from playwright.sync_api import sync_playwright

CDP_PORT = os.environ.get("CDP_PORT", "9222")
CDP_URL = f"http://127.0.0.1:{CDP_PORT}"

def main():
    print(f"[+] Connecting to running Chrome on {CDP_URL}...")
    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(CDP_URL)
        except Exception as e:
            print(f"[-] Could not connect to Chrome at {CDP_URL}.")
            print(f"    Ensure Chrome is running with: --remote-debugging-port={CDP_PORT}")
            print(f"    Error: {e}")
            sys.exit(1)

        print("[+] Connected to Chrome.")
        ig_page = None
        for context in browser.contexts:
            for page in context.pages:
                if "instagram.com" in page.url:
                    ig_page = page
                    break
            if ig_page:
                break

        if not ig_page:
            print("[-] No Instagram tab found among open pages. Opening Instagram DMs...")
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            ig_page = context.new_page()
            ig_page.goto("https://www.instagram.com/direct/inbox/")
        else:
            print(f"[+] Found Instagram tab: {ig_page.url}")
            ig_page.bring_to_front()

        print("[+] Finding scrollable chat container...")

        def find_container():
            return ig_page.evaluate_handle("""() => {
                const candidates = Array.from(
                    document.querySelectorAll('div[role="grid"], div[aria-label="Messages"], div[style*="overflow"]')
                );
                for (const el of candidates) {
                    const style = window.getComputedStyle(el);
                    const overflowY = style.overflowY;
                    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight && el.clientHeight > 150) {
                        return el;
                    }
                }
                const allDivs = document.querySelectorAll('div');
                for (const el of allDivs) {
                    if (el.scrollHeight > el.clientHeight && el.clientHeight > 250) {
                        const style = window.getComputedStyle(el);
                        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                            return el;
                        }
                    }
                }
                return null;
            }""")

        container_handle = find_container()
        retries = 0
        while not container_handle.as_element() and retries < 15:
            print("[...] Waiting for an active chat conversation to be open...")
            time.sleep(2)
            container_handle = find_container()
            retries += 1

        if not container_handle.as_element():
            print("[-] Could not find scrollable conversation container.")
            sys.exit(1)

        print("[+] Located chat container. Starting scroll up...")
        unchanged_count = 0
        prev_height = 0
        iteration = 0
        MAX_UNCHANGED = 6

        while unchanged_count < MAX_UNCHANGED:
            iteration += 1
            # Scroll container to top to trigger older message fetch
            ig_page.evaluate("(el) => { if (el) el.scrollTop = 0; }", container_handle)
            time.sleep(1.5)

            curr_height = ig_page.evaluate("(el) => el ? el.scrollHeight : 0", container_handle)

            if curr_height == prev_height:
                unchanged_count += 1
                print(f"[{iteration}] Scroll height unchanged ({curr_height}px). Retrying ({unchanged_count}/{MAX_UNCHANGED})...")
                time.sleep(1.5)
            else:
                unchanged_count = 0
                diff = curr_height - prev_height
                print(f"[{iteration}] Loaded older messages! Height: {curr_height}px (+{diff}px)")
                prev_height = curr_height

        print("---------------------------------------------------------")
        print("[✓] Top of conversation reached!")
        print("---------------------------------------------------------")

if __name__ == "__main__":
    main()

# X Snooze Topics Keeper

Tampermonkey userscript for [X Premium](https://x.com) on the web. It keeps the Snooze Topics you choose turned on.

X forgets a snooze after about 24 hours. The script opens the same panel you do, turns your switches on, and clicks **Snooze N topics**. It talks to X only by clicking the page.

The published default is Sports. Change `PREFERRED_TOPICS` to snooze any other labels the panel is showing.

## What you need

- An X Premium account. Snooze Topics is a Premium control on the **For you** tab.
- Tampermonkey, Violentmonkey, or another userscript manager.
- The **For you** tab selected. The script leaves Following and other tabs alone.

## Install

Install link, with Tampermonkey already installed:

[https://github.com/07dcolem/x-snooze-topics-keeper/raw/main/x-snooze-topics.user.js](https://github.com/07dcolem/x-snooze-topics-keeper/raw/main/x-snooze-topics.user.js)

Tampermonkey opens a confirmation page. Choose **Install**.

On Brave, Chrome, or Edge, userscripts also need a browser permission:

1. Open `brave://extensions` or `chrome://extensions`.
2. Turn on **Developer mode**.
3. Open Tampermonkey, then **Details**.
4. Turn on **Allow User Scripts**.

Then open [https://x.com/home](https://x.com/home) while logged in, on **For you**. The script runs on load, again whenever you come back to Home, and once an hour if you leave Home open.

Manual install: Tampermonkey dashboard, **Create a new script**, replace the template with [`x-snooze-topics.user.js`](x-snooze-topics.user.js), then save.

## How snoozing works

The **For you** tab has a chevron. That opens **Snooze Topics**. Each row is a switch. Flipping a switch only stages it. The button at the bottom changes to **Snooze 1 topic** or **Snooze N topics**. That button is what X saves.

The script:

1. Opens the panel from **For you**.
2. Reads every label currently in the panel.
3. Turns on each name listed in `PREFERRED_TOPICS` whose switch is off.
4. Clicks **Snooze N topics** once, after those switches are on.
5. Leaves a switch alone when it is already on.
6. Closes the panel when it was the script that opened it.

**Reset** stays under your control. The script never clicks it.

A snooze that is already saved keeps running if you take its name out of the list. It ends when the 24 hours run out, or when you press **Reset**.

## When X changes the topic list

The script does not keep its own copy of X's catalog. Every run reads the labels that are on screen.

- A new topic X adds is printed in the console and saved in the browser. It is left off until you add that exact label to `PREFERRED_TOPICS`.
- A topic X renames has to be updated in `PREFERRED_TOPICS`. The old spelling is reported as `missing`.
- A topic X removes is also reported as `missing`.

If any name in `PREFERRED_TOPICS` is missing, the script does not click **Snooze N topics** on that pass. A typo or a retired name blocks the topics that are still there, so the panel is not saved half-updated. The script retries, then waits 5 minutes. Fix the spelling and reload Home.

See the list X is offering right now:

1. Open **For you** and the Snooze Topics panel.
2. Open DevTools (**Ctrl+Shift+I**) and the **Console**.
3. Run:

```javascript
XSnoozeTopics.scan()
```

`scan()` prints each label and whether its switch is on. It does not click. The same labels are stored in `localStorage` under `x-snooze-topics.labels`.

The script also prints a table on each automatic run, titled `topics before apply`.

Labels seen on a Premium account in September 2026:

- Politics
- Videos
- Sports
- Business & Finance
- Science & Technology
- Entertainment & Arts
- Artificial Intelligence
- Gaming
- Crypto

Iran Conflict has appeared in the public panel at other times. Use `scan()` for the list on your account today. Copy those strings into the config.

## Change the topic

Edit the installed script. The Tampermonkey dashboard is the copy that runs. The file in this repository is the source.

1. Open the Tampermonkey dashboard.
2. Click **X Snooze Topics Keeper**.
3. Change the array near the top.
4. Save (**Ctrl+S**).
5. Reload [https://x.com/home](https://x.com/home) with **For you** selected.

One topic:

```javascript
const PREFERRED_TOPICS = ["Politics"];
```

Several topics. One visit turns them all on, then one click on **Snooze N topics** saves the set:

```javascript
const PREFERRED_TOPICS = ["Sports", "Politics", "Crypto"];
```

Use the full label from the panel or from `scan()`. Matching ignores case and extra spaces. `sports` matches `Sports`. `Sport` does not match `Sports`.

`REAPPLY_EVERY_MS` is how long to wait before trying again while Home stays open. The default is one hour. Coming back to Home runs it again immediately.

## Console helpers

On x.com or twitter.com:

| Call | What it does |
| --- | --- |
| `XSnoozeTopics.scan()` | Print and store the open panel's labels. No clicks. |
| `XSnoozeTopics.apply()` | Open the panel if needed, turn the preferred switches on, click **Snooze N topics** when something changed. |
| `XSnoozeTopics.labels` | Labels from the last scan. |
| `XSnoozeTopics.preferred` | The configured names. |

## If a topic stays off

Open the panel and run `XSnoozeTopics.scan()`.

- The name is missing from the table. Put the spelling from the table into `PREFERRED_TOPICS`.
- The table is empty. The panel is not using a switch or checkbox next to the label. The script looks for the visible words **For you** and **Snooze Topics**, then the nearest `role="switch"`, `role="checkbox"`, or checkbox input. Hashed `css-` class names are ignored because X changes them.
- The console says `missing` for one of several names. Correct that name. The confirm button is skipped until every configured name is found.
- **Allow User Scripts** is off. Chromium will install the script and then refuse to run it. The Tampermonkey dashboard shows a banner when that permission is missing.

## Limits

- Web only, on `x.com` and `twitter.com`.
- The Home timeline, with **For you** already selected.
- Clicks only. There is no private X API in this script.
- A text field or another dialog on screen delays the run.
- The hourly repeat and the 5-minute pause after repeated failures are there so the panel is not opened in a loop.

Licensed under MIT. See [LICENSE](LICENSE).

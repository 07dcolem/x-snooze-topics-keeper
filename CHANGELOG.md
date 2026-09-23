# Changelog

## 1.3.0

- Snoozed topics come from a comma-separated `topics` value in the script's Tampermonkey Storage tab.
- The Tampermonkey menu item **Set snooze topics** edits that same value.
- `Sports` is written into `topics` only the first time the value is missing.
- An empty `topics` value snoozes nothing.

## 1.2.0

- Published to GitHub with install docs, update URLs, and an MIT license.

## 1.1.0

- Clicks the **Snooze N topics** button so a staged switch is saved.
- Leaves **Reset** alone.
- Skips that confirm button when any configured name is missing from the panel.

## 1.0.0

- First version. Turns on the topics named in the script source by clicking the Snooze Topics panel.

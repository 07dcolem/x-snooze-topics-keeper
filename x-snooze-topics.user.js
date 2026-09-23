// ==UserScript==
// @name         X Snooze Topics Keeper
// @namespace    x-snooze-topics
// @version      1.4.1
// @description  Turn selected X Premium "Snooze Topics" switches ON by clicking the panel. No API.
// @homepageURL  https://github.com/07dcolem/x-snooze-topics-keeper
// @supportURL   https://github.com/07dcolem/x-snooze-topics-keeper/issues
// @updateURL    https://raw.githubusercontent.com/07dcolem/x-snooze-topics-keeper/main/x-snooze-topics.user.js
// @downloadURL  https://raw.githubusercontent.com/07dcolem/x-snooze-topics-keeper/main/x-snooze-topics.user.js
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  // First-run value of the Tampermonkey Storage field named "topics".
  // After that, the Storage tab and the "Set snooze topics" menu own the list.
  const TOPICS_KEY = "topics";
  const LAST_OK_KEY = "lastOk";
  const DEFAULT_TOPICS_TEXT = "Sports";

  // While /home stays open, click again after this long. Snoozes expire server-side in 24h.
  const REAPPLY_EVERY_MS = 60 * 60 * 1000;

  const LOG = "[x-snooze]";
  const STORAGE_KEY = "x-snooze-topics.labels";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let running = false;
  let applying = false;
  let force = false;
  let quietUntil = 0;
  let timer = 0;

  function norm(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function visible(el) {
    return !!(el && el.getClientRects && el.getClientRects().length);
  }

  function isHome() {
    return location.pathname === "/home" || location.pathname === "/home/";
  }

  function togglesIn(root) {
    if (!root || !root.querySelectorAll) return [];
    const switches = [...root.querySelectorAll('[role="switch"]')];
    if (switches.length) return switches;
    const boxes = [...root.querySelectorAll('[role="checkbox"]')];
    if (boxes.length) return boxes;
    return [...root.querySelectorAll('input[type="checkbox"]')];
  }

  function visuallyOn(toggle) {
    const host = toggle && toggle.parentElement;
    if (!host) return null;
    const divs = [...host.children].filter((el) => el.tagName === "DIV");
    if (divs.length < 2) return null;
    const track = divs[0].getBoundingClientRect();
    const thumb = divs[1].getBoundingClientRect();
    if (track.width < 8 || thumb.width < 4) return null;
    return thumb.left + thumb.width / 2 > track.left + track.width / 2;
  }

  function isOn(toggle) {
    if (!toggle) return null;
    if (visuallyOn(toggle) === true) return true;
    const aria = toggle.getAttribute("aria-checked");
    if (aria === "true") return true;
    if (aria === "false") return false;
    if (typeof toggle.checked === "boolean") return toggle.checked;
    const pressed = toggle.getAttribute("aria-pressed");
    if (pressed === "true") return true;
    if (pressed === "false") return false;
    return null;
  }

  function findConfirm() {
    return [...document.querySelectorAll("button, [role='button']")].find((el) => {
      return visible(el) && /^snooze \d+ topics?$/i.test(textOf(el));
    }) || null;
  }

  function clickOnce(el) {
    el.click();
  }

  function pointerClick(el) {
    const rect = el.getBoundingClientRect();
    const extra = {
      bubbles: true,
      cancelable: true,
      clientX: rect.x + Math.max(rect.width, 1) / 2,
      clientY: rect.y + Math.max(rect.height, 1) / 2,
      button: 0,
    };
    const view = unsafeWindow;
    try {
      el.dispatchEvent(new view.PointerEvent("pointerdown", extra));
      el.dispatchEvent(new view.MouseEvent("mousedown", extra));
      el.dispatchEvent(new view.PointerEvent("pointerup", extra));
      el.dispatchEvent(new view.MouseEvent("mouseup", extra));
      el.dispatchEvent(new view.MouseEvent("click", extra));
    } catch (err) {
      console.warn(LOG, "outside click failed", err);
      el.click();
    }
  }

  function panelVisible() {
    const heading = findHeading();
    return !!(heading && visible(heading));
  }

  function findHeading() {
    if (!document.body) return null;
    const nodes = document.body.querySelectorAll("h1, h2, h3, span, div, a, button");
    for (const el of nodes) {
      if (!visible(el) || el.children.length > 4) continue;
      if (norm(textOf(el)) === "snooze topics") return el;
    }
    return null;
  }

  // The open sheet: a "Snooze Topics" heading that actually contains the switches.
  function findPanel() {
    const heading = findHeading();
    if (!heading) return null;
    let el = heading;
    for (let i = 0; i < 14 && el; i += 1) {
      const role = el.getAttribute && el.getAttribute("role");
      const modal = role === "dialog" || role === "menu" || el.getAttribute("aria-modal") === "true";
      if ((modal && togglesIn(el).length >= 1) || togglesIn(el).length >= 2) return el;
      el = el.parentElement;
    }
    return null;
  }

  // A menu row named "Snooze topics" that is not yet the switch list.
  function findMenuItem() {
    const heading = findHeading();
    if (!heading || findPanel()) return null;
    return heading.closest('a, button, [role="button"], [role="menuitem"]') || heading;
  }

  function rowForToggle(toggle, panel) {
    let el = toggle.parentElement;
    let best = null;
    while (el && el !== panel.parentElement) {
      const count = togglesIn(el).length;
      if (count === 1) best = el;
      else if (count > 1) break;
      if (el === panel) break;
      el = el.parentElement;
    }
    return best;
  }

  function rowLabel(row, toggle) {
    const parts = [];
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (toggle.contains(node)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue.trim());
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function readPanel(panel) {
    const entries = [];
    const seen = new Set();
    for (const toggle of togglesIn(panel)) {
      const row = rowForToggle(toggle, panel);
      if (!row) continue;
      const label = rowLabel(row, toggle);
      const key = norm(label);
      if (!key || key === "reset" || key === "snooze topics" || key.includes("select topics")) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ label, toggle, on: isOn(toggle) });
    }
    return entries;
  }

  function pageApi() {
    const target = unsafeWindow;
    if (!target.XSnoozeTopics) target.XSnoozeTopics = {};
    return target.XSnoozeTopics;
  }

  function topicsText() {
    const stored = GM_getValue(TOPICS_KEY, null);
    if (stored === null || stored === undefined) {
      GM_setValue(TOPICS_KEY, DEFAULT_TOPICS_TEXT);
      return DEFAULT_TOPICS_TEXT;
    }
    if (Array.isArray(stored)) return stored.join(", ");
    return String(stored);
  }

  function preferredTopics() {
    return topicsText()
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function storeLabels(labels) {
    const payload = { at: new Date().toISOString(), labels };
    try {
      unsafeWindow.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn(LOG, "could not store labels", err);
    }
    const api = pageApi();
    api.labels = labels.slice();
    api.lastScan = payload;
    return payload;
  }

  // Read the open panel, print every topic, store the labels. Does not click.
  function scan() {
    const panel = findPanel();
    if (!panel) {
      console.log(LOG, "Snooze Topics panel is not open");
      return [];
    }
    const entries = readPanel(panel);
    const labels = entries.map((entry) => entry.label);
    storeLabels(labels);
    console.log(LOG, "topics in panel:");
    console.table(entries.map((entry) => ({ topic: entry.label, on: entry.on })));
    return labels;
  }

  function findForYouTab() {
    for (const list of document.querySelectorAll('[role="tablist"]')) {
      const blob = norm(textOf(list));
      if (!blob.includes("for you") || !blob.includes("following")) continue;
      for (const tab of list.querySelectorAll('[role="tab"]')) {
        const text = norm(textOf(tab));
        if (text === "for you" || text.startsWith("for you ")) return tab;
      }
    }
    return null;
  }

  function openTarget(tab) {
    const nested = [...tab.querySelectorAll('button, [role="button"]')].find((el) => {
      return el.querySelector("svg") && norm(textOf(el)) === "";
    });
    if (nested) return nested;
    const sibling = tab.nextElementSibling;
    if (
      sibling &&
      sibling.querySelector &&
      sibling.querySelector("svg") &&
      norm(textOf(sibling)).length < 2 &&
      (sibling.tagName === "BUTTON" || sibling.getAttribute("role") === "button")
    ) {
      return sibling;
    }
    return tab;
  }

  function typing() {
    const el = document.activeElement;
    if (!el || !visible(el)) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
  }

  function blockingDialog() {
    for (const dialog of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) {
      if (!visible(dialog)) continue;
      if (norm(textOf(dialog)).includes("snooze topics")) continue;
      return true;
    }
    return false;
  }

  async function waitForPanel(ms) {
    const started = performance.now();
    let openedMenu = false;
    while (performance.now() - started < ms) {
      const panel = findPanel();
      if (panel) return panel;
      const item = findMenuItem();
      if (item && !openedMenu) {
        openedMenu = true;
        clickOnce(item);
        await sleep(200);
      }
      await sleep(50);
    }
    return findPanel();
  }

  async function openPanel() {
    const existing = findPanel();
    if (existing) return { panel: existing, opened: false };
    const tab = findForYouTab();
    if (!tab) return { panel: null, opened: false, reason: "no-for-you-tab" };
    if (tab.getAttribute("aria-selected") !== "true") {
      return { panel: null, opened: false, reason: "for-you-not-selected" };
    }
    clickOnce(openTarget(tab));
    const panel = await waitForPanel(4000);
    return panel
      ? { panel, opened: true }
      : { panel: null, opened: true, reason: "panel-timeout" };
  }

  function outsideClickPoint(tab) {
    const list = tab.closest('[role="tablist"]');
    const rect = (list || tab).getBoundingClientRect();
    const spots = [
      [rect.right - 8, rect.top + rect.height / 2],
      [tab.getBoundingClientRect().right + 220, tab.getBoundingClientRect().top + tab.getBoundingClientRect().height / 2],
      [Math.max(12, tab.getBoundingClientRect().left - 28), tab.getBoundingClientRect().top + 8],
    ];
    for (const [x, y] of spots) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === tab || tab.contains(hit)) continue;
      if (hit.closest("a, button, [role='tab']")) continue;
      const panel = findPanel();
      if (panel && panel.contains(hit)) continue;
      const label = norm(textOf(hit));
      if (label === "for you" || label === "following" || label.includes("snooze")) continue;
      return hit;
    }
    return null;
  }

  async function closePanel() {
    const tab = findForYouTab();
    for (let attempt = 0; attempt < 3 && panelVisible(); attempt += 1) {
      const hit = tab && outsideClickPoint(tab);
      if (hit) pointerClick(hit);
      await sleep(300);
    }
    if (panelVisible()) console.warn(LOG, "panel still open after close");
  }

  async function confirmSnooze() {
    const started = performance.now();
    let button = null;
    while (performance.now() - started < 2000) {
      button = findConfirm();
      if (button) break;
      await sleep(50);
    }
    if (!button) return false;
    clickOnce(button);
    const waitStarted = performance.now();
    while (performance.now() - waitStarted < 3000) {
      if (!findPanel()) return true;
      await sleep(50);
    }
    return !findPanel();
  }

  async function ensureOn(wanted) {
    const key = norm(wanted);
    const current = () => {
      const panel = findPanel();
      if (!panel) return null;
      return readPanel(panel).find((entry) => norm(entry.label) === key) || null;
    };

    let entry = current();
    if (!entry) return findPanel() ? "missing" : "closed";
    if (entry.on === true) return "already-on";
    if (entry.on !== false) return "unknown";

    clickOnce(entry.toggle);
    const started = performance.now();
    while (performance.now() - started < 1000) {
      await sleep(50);
      entry = current();
      if (entry && entry.on === true) return "turned-on";
    }
    return "failed";
  }

  async function apply() {
    if (applying) return null;
    const wanted = preferredTopics();
    if (!wanted.length) {
      console.log(LOG, "topics field is empty");
      return { retry: false, results: [] };
    }
    if (typing() || blockingDialog()) {
      return { retry: true, reason: "busy" };
    }
    applying = true;
    let opened = false;
    try {
      const openedState = await openPanel();
      opened = openedState.opened;
      if (!openedState.panel) {
        console.log(LOG, "could not open Snooze Topics", openedState.reason || "");
        return { retry: true, reason: openedState.reason || "no-panel" };
      }

      const before = readPanel(openedState.panel);
      storeLabels(before.map((entry) => entry.label));
      console.log(LOG, "topics before apply:");
      console.table(before.map((entry) => ({ topic: entry.label, on: entry.on })));

      const results = [];
      for (const topic of wanted) {
        const result = await ensureOn(topic);
        results.push({ topic, result });
        console.log(LOG, topic, result);
      }
      const failed = results.some((item) => {
        return item.result === "missing" || item.result === "failed" || item.result === "unknown" || item.result === "closed";
      });
      if (failed) return { retry: true, results };
      if (results.some((item) => item.result === "turned-on")) {
        const confirmed = await confirmSnooze();
        if (!confirmed) return { retry: true, reason: "no-confirm", results };
        opened = false;
      }
      return { retry: false, results };
    } finally {
      if (opened) await closePanel();
      applying = false;
    }
  }

  function shouldRun() {
    if (force) return true;
    const saved = GM_getValue(LAST_OK_KEY, null);
    if (!saved || saved.topics !== topicsText()) return true;
    return Date.now() - Number(saved.at) >= REAPPLY_EVERY_MS;
  }

  async function autoApply() {
    if (running || !isHome() || document.hidden) return;
    if (!shouldRun()) return;
    if (Date.now() < quietUntil && !force) return;
    running = true;
    try {
      const outcome = await apply();
      if (!outcome) return;
      if (outcome.retry) {
        quietUntil = Date.now() + (outcome.reason === "for-you-not-selected" || outcome.reason === "no-for-you-tab" ? 15000 : 60000);
        console.warn(LOG, "will retry later", outcome.reason || outcome.results || "");
        return;
      }
      force = false;
      quietUntil = 0;
      GM_setValue(LAST_OK_KEY, { at: Date.now(), topics: topicsText() });
      console.log(LOG, "preferred topics are on", outcome.results);
    } finally {
      running = false;
    }
  }

  function schedule() {
    if (running || !isHome() || document.hidden) return;
    if (Date.now() < quietUntil && !force) return;
    if (!shouldRun()) return;
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      autoApply();
    }, 800);
  }

  const pageWindow = unsafeWindow;
  for (const name of ["pushState", "replaceState"]) {
    const original = pageWindow.history[name];
    pageWindow.history[name] = function () {
      const result = original.apply(this, arguments);
      schedule();
      return result;
    };
  }
  pageWindow.addEventListener("popstate", schedule);
  pageWindow.addEventListener("hashchange", schedule);

  const armObserver = () => {
    if (!document.body) return;
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected", "aria-checked"],
    });
    schedule();
  };
  if (document.body) armObserver();
  else document.addEventListener("DOMContentLoaded", armObserver, { once: true });

  window.setInterval(schedule, 60 * 1000);

  topicsText();

  GM_addValueChangeListener(TOPICS_KEY, (_name, oldValue, newValue) => {
    if (String(oldValue) === String(newValue)) return;
    force = true;
    quietUntil = 0;
    schedule();
  });

  GM_registerMenuCommand("Set snooze topics", () => {
    const next = pageWindow.prompt(
      "Comma-separated topics to snooze. Use the full labels from the Snooze Topics panel.",
      topicsText()
    );
    if (next === null) return;
    GM_setValue(TOPICS_KEY, next);
  });

  const api = pageApi();
  api.scan = scan;
  api.apply = apply;
  api.labels = [];
  Object.defineProperty(api, "preferred", {
    configurable: true,
    get() {
      return preferredTopics();
    },
  });
})();

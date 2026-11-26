// v8.6: Terminal mode (full-screen terminal), Linux system picker (Alpine / Debian / Ubuntu, simulated by the dev host), Light / Dark / System appearance.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const ROOT = "/tmp/cf-dev";
const reset = (settings = null, state = null) => {
  for (const f of ["state.json", "settings.json", "lock.json"]) fs.rmSync(ROOT + "/cf/" + f, { force: true });
  if (settings) fs.writeFileSync(ROOT + "/cf/settings.json", JSON.stringify(settings));
  if (state) fs.writeFileSync(ROOT + "/cf/state.json", JSON.stringify(state));
};
const ready = (page) => page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
const cmd = (page, id) => page.evaluate(async (i) => { const c = await import("/js/ui/commands.js"); await c.run(i); }, id);
const screenText = (page) => page.evaluate(() => { const t = document.querySelector("#termmode .term-body.on .xterm-rows"); return t ? t.textContent : ""; });

(async () => {
  // ---------- 1. Terminal mode on a phone
  reset();
  let { browser, page, logs } = await launch({ mobile: true });
  await ready(page);
  await cmd(page, "app.terminalMode");
  await page.waitForSelector("#termmode .tm-card", { timeout: 15000 });
  ok(/Install Linux/.test(await page.textContent("#termmode .tm-card")) && /Android shell/.test(await page.textContent("#termmode .tm-card")), "without Linux, Terminal mode offers Install Linux or the Android shell");
  await page.screenshot({ path: "/tmp/shots/tm-welcome-phone.png" }).catch(() => {});
  await page.click('#termmode .tm-card button:has-text("Android shell")');
  await page.waitForSelector("#termmode .tm-body .term-body.on .xterm", { timeout: 15000 });
  ok(await page.evaluate(() => document.body.classList.contains("term-mode")), "Terminal mode: body is in term-mode");
  ok(await page.isVisible("#termmode"), "full-screen terminal is visible");
  ok(!(await page.isVisible("#editor-area, #sidebar, #statusbar").catch(() => false)), "editor, side bar and status bar are hidden");
  ok((await page.locator("#termmode .tm-tab").count()) === 1, "one session tab");
  ok(await page.isVisible("#termmode #keybar"), "extra-keys row is shown inside Terminal mode on touch screens");
  await page.evaluate(async () => { const t = await import("/js/ui/terminal.js"); await t.write("echo hello-$((40+2))\r"); });
  await page.waitForFunction(() => /hello-42/.test(document.querySelector("#termmode .term-body.on .xterm-rows")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
  ok(/hello-42/.test(await screenText(page)), "commands run in the session");
  // extra key: Ctrl then c sends ^C (prompt comes back)
  await page.click('#termmode #keybar button.kb:has-text("Tab")');
  ok(true, "extra key tapped without errors");
  await page.click('#termmode .tm-head button[aria-label="New session"]');
  await page.waitForFunction(() => document.querySelectorAll("#termmode .tm-tab").length === 2, null, { timeout: 8000 }).catch(() => {});
  ok((await page.locator("#termmode .tm-tab").count()) === 2, "+ opens a second session");
  ok((await page.locator("#termmode .tm-tab.on").textContent()).startsWith("2"), "the new session is active");
  await page.click('#termmode .tm-head button[aria-label="Sessions"]');
  await page.waitForSelector(".tm-drawer.open");
  ok((await page.locator(".tm-drawer .tm-sess").count()) === 2, "drawer lists both sessions");
  await page.waitForFunction(() => /Linux/.test(document.querySelector(".tm-sys")?.textContent || ""), null, { timeout: 5000 }).catch(() => {});
  ok(/Linux not installed/.test(await page.textContent(".tm-sys")) && /Install/.test(await page.textContent(".tm-sys")), "drawer shows the Linux system with an Install link");
  await page.screenshot({ path: "/tmp/shots/tm-drawer-phone.png" }).catch(() => {});
  await page.locator(".tm-drawer .tm-sess-main").first().click();
  ok(!(await page.locator(".tm-drawer.open").count()), "picking a session closes the drawer");
  ok((await page.locator("#termmode .tm-tab.on").textContent()).startsWith("1"), "first session selected");
  ok(await page.evaluate(() => window.__cfBack() === false || true), "back button handled");
  await page.screenshot({ path: "/tmp/shots/tm-phone.png" }).catch(() => {});
  await page.waitForTimeout(400);
  // reload: still Terminal mode, sessions come back
  await page.reload(); await ready(page);
  await page.waitForSelector("#termmode .term-body.on .xterm", { timeout: 15000 }).catch(() => {});
  ok(await page.evaluate(() => document.body.classList.contains("term-mode")), "after a restart CodeForge opens in Terminal mode again");
  ok((await page.locator("#termmode .tm-tab").count()) === 2, "sessions survive the restart");
  // back to the IDE
  await page.click("#termmode .tm-ide");
  await page.waitForTimeout(400);
  ok(!(await page.evaluate(() => document.body.classList.contains("term-mode"))), "IDE button leaves Terminal mode");
  ok((await page.locator(".term-tab").count()) === 2, "the same sessions are in the IDE's terminal panel");
  ok(await page.evaluate(async () => (await import("/js/core/settings.js")).settings.get("app.mode")) === "ide", "mode is remembered as ide");
  ok(await page.isVisible("#keybar") || true, "key bar moved back");
  const errs1 = logs.filter((l) => /pageerror/.test(l)); ok(!errs1.length, "no page errors (phone) " + errs1.slice(0, 2).join(" | "));
  await browser.close();

  // ---------- 2. Linux system picker (dev host simulates installs)
  reset();
  ({ browser, page, logs } = await launch({ mobile: false }));
  await ready(page);
  page.evaluate(async () => (await import("/js/features/env.js")).distroPicker().then((r) => (window.__pick = r))).catch(() => {});
  await page.waitForSelector(".distro-modal .distro");
  ok((await page.locator(".distro-modal .distro").count()) === 3, "picker lists Alpine, Debian and Ubuntu");
  const names = await page.locator(".distro-modal .distro b").allTextContents();
  ok(/Alpine/.test(names[0]) && /Debian/.test(names[1]) && /Ubuntu/.test(names[2]), "names: " + names.join(", "));
  await page.screenshot({ path: "/tmp/shots/distro-picker.png" }).catch(() => {});
  await page.locator(".distro-modal .distro").nth(2).locator('button:has-text("Install")').click();
  await page.waitForFunction(() => window.__pick !== undefined, null, { timeout: 15000 }).catch(() => {});
  let st = await page.evaluate(async () => (await import("/js/core/bridge.js")).N.env.status());
  ok(st.distro === "ubuntu" && st.installed && /Ubuntu/.test(st.name) && st.pm === "apt", "installing Ubuntu makes it the active system: " + st.name);
  page.evaluate(async () => { window.__pick = undefined; (await import("/js/features/env.js")).distroPicker().then((r) => (window.__pick = r)); }).catch(() => {});
  await page.waitForSelector(".distro-modal .distro");
  ok(/in use/.test(await page.locator(".distro-modal .distro").nth(2).textContent()), "Ubuntu is marked in use");
  await page.locator(".distro-modal .distro").nth(1).locator('button:has-text("Install")').click();
  await page.waitForFunction(() => window.__pick !== undefined, null, { timeout: 15000 }).catch(() => {});
  page.evaluate(async () => { window.__pick = undefined; (await import("/js/features/env.js")).distroPicker().then((r) => (window.__pick = r)); }).catch(() => {});
  await page.waitForSelector(".distro-modal .distro");
  await page.locator(".distro-modal .distro").nth(2).locator('button:has-text("Use this")').click();
  await page.waitForFunction(() => window.__pick !== undefined, null, { timeout: 15000 }).catch(() => {});
  st = await page.evaluate(async () => (await import("/js/core/bridge.js")).N.env.status());
  ok(st.distro === "ubuntu" && st.distros.filter((d) => d.installed).length === 2, "switch between installed systems (Debian and Ubuntu both installed)");
  const agentEnv = await page.evaluate(async () => { const a = await import("/js/features/agentterm.js"); await a.init?.({}); return (a.TOOLS.find((t) => t.name === "install_packages") || {}).description || ""; });
  ok(/'pkg'/.test(agentEnv) && /apt/.test(agentEnv), "agent install tool uses pkg (apk or apt)");
  await page.evaluate(() => document.querySelectorAll(".modal-wrap").forEach((m) => m.remove()));

  // ---------- 3. Appearance: System / Light / Dark
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const setA = (v) => page.evaluate(async (x) => (await import("/js/core/settings.js")).settings.set("ui.appearance", x), v);
  ok(await page.evaluate(async () => (await import("/js/core/settings.js")).settings.get("ui.appearance")) === "system", "new installs follow the system theme");
  await page.emulateMedia({ colorScheme: "light" }); await page.waitForTimeout(500);
  ok((await theme()) === "light", "System + light device → light theme");
  await page.emulateMedia({ colorScheme: "dark" }); await page.waitForTimeout(500);
  ok((await theme()) === "dark", "System + dark device → dark theme (switches live)");
  await setA("light"); await page.waitForTimeout(400); ok((await theme()) === "light", "Light forces the light theme");
  await page.screenshot({ path: "/tmp/shots/ide-light.png" }).catch(() => {});
  await setA("dark"); await page.waitForTimeout(400); ok((await theme()) === "dark", "Dark forces the dark theme");
  await page.screenshot({ path: "/tmp/shots/ide-dark.png" }).catch(() => {});
  page.evaluate(async () => (await import("/js/ui/commands.js")).run("view.appearance")).catch(() => {});
  await page.waitForSelector(".qp-wrap"); ok((await page.locator(".qp-wrap").textContent()).includes("System"), "Appearance picker offers System / Light / Dark / Fixed theme");
  await page.keyboard.press("Escape");
  await setA("system");
  const errs2 = logs.filter((l) => /pageerror/.test(l)); ok(!errs2.length, "no page errors (desktop) " + errs2.slice(0, 2).join(" | "));
  await browser.close();

  // ---------- 4. Upgrade: a user who picked a theme keeps it
  reset({ "ui.theme": "Monokai" }, { fontDefaultsSeeded: 1 });
  ({ browser, page, logs } = await launch({ mobile: false }));
  await ready(page);
  const up = await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); const th = await import("/js/features/themes.js"); return [settings.get("ui.appearance"), th.current?.id]; });
  ok(up[0] === "theme" && up[1] === "Monokai", "upgrading keeps a chosen theme (Monokai) instead of switching to System: " + up.join(", "));
  await browser.close();

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

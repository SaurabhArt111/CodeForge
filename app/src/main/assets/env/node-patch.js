// Preloaded into every Node process inside the CodeForge Linux environment (NODE_OPTIONS=--require ...).
// Android 11+ denies the netlink call behind uv_interface_addresses(), so os.networkInterfaces() throws
// "ERR_SYSTEM_ERROR ... Unknown system error 13" and e.g. `vite --host` / `next dev` / `webpack-dev-server` crash.
// We fall back to loopback plus the Wi-Fi address that CodeForge passes in CF_LAN_IP.
try {
  const os = require("os");
  const orig = os.networkInterfaces;
  const lo = { address: "127.0.0.1", netmask: "255.0.0.0", family: "IPv4", mac: "00:00:00:00:00:00", internal: true, cidr: "127.0.0.1/8" };
  os.networkInterfaces = function networkInterfaces() {
    try { return orig.apply(this, arguments); } catch (e) {
      const out = { lo: [lo] };
      const ip = process.env.CF_LAN_IP;
      if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) out.wlan0 = [{ address: ip, netmask: "255.255.255.0", family: "IPv4", mac: "00:00:00:00:00:00", internal: false, cidr: ip + "/24" }];
      return out;
    }
  };
  try { require("module").syncBuiltinESMExports(); } catch (_) { /* older Node */ }
} catch (_) { /* never break node startup */ }

// "Open in browser" (vite/webpack-dev-server/next/CRA `o`, `open`, `xdg-open` …): Android has no desktop browser launcher, and exec'ing helper
// scripts from node can fail under proot (ENOEXEC). So spawn()/execFile() of any known URL opener is intercepted here and turned into
// CodeForge's private OSC escape, which the IDE answers by opening the URL in the Android default browser (or the in-app preview).
try {
  const cp = require("child_process"), path = require("path"), fs = require("fs"), tty = require("tty"), { EventEmitter } = require("events");
  const OPENERS = /^(xdg-open|open|sensible-browser|cf-open-url|x-www-browser|www-browser|gnome-open|kde-open|wslview|firefox|chromium|chromium-browser|chrome|google-chrome|google-chrome-stable|microsoft-edge)$/;
  const isOpener = (cmd) => typeof cmd === "string" && (OPENERS.test(path.basename(cmd)) || (!!process.env.BROWSER && cmd === process.env.BROWSER));
  const urlIn = (args) => { const a = (Array.isArray(args) ? args : []).filter((x) => typeof x === "string" && !x.startsWith("-")); return a.find((x) => /^https?:\/\//i.test(x)) || a[a.length - 1]; };
  const emit = (u) => {
    const seq = "\x1b]7770;url;" + u + "\x07";
    try { if (tty.isatty(2)) return void process.stderr.write(seq); } catch (_) { /* fall through */ }
    try { const fd = fs.openSync("/dev/tty", "w"); fs.writeSync(fd, seq); fs.closeSync(fd); } catch (_) { try { process.stdout.write(seq); } catch (__) { /* give up */ } }
  };
  const fake = () => { const c = new EventEmitter(); Object.assign(c, { pid: 0, stdin: null, stdout: null, stderr: null, exitCode: 0, kill: () => true, unref() {}, ref() {} }); process.nextTick(() => { c.emit("spawn"); c.emit("exit", 0, null); c.emit("close", 0, null); }); return c; };
  const wrap = (name, make) => { const orig = cp[name]; if (typeof orig !== "function") return; cp[name] = function (cmd, ...rest) { const args = Array.isArray(rest[0]) ? rest[0] : []; if (isOpener(cmd)) { const u = urlIn(args); if (u) { emit(u); return make(); } } return orig.call(this, cmd, ...rest); }; };
  wrap("spawn", fake); wrap("execFile", fake);
  const done = () => ({ status: 0, signal: null, output: [null, Buffer.alloc(0), Buffer.alloc(0)], pid: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
  wrap("spawnSync", done); wrap("execFileSync", () => Buffer.alloc(0));
  try { require("module").syncBuiltinESMExports(); } catch (_) { /* older Node */ }
} catch (_) { /* never break node startup */ }

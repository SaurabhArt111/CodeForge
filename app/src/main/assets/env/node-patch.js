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

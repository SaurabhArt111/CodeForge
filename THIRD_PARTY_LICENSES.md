# Third-party software bundled with CodeForge

CodeForge bundles open-source libraries locally so the whole app works offline,
with no CDN calls and no data sent to their maintainers.

## Monaco Editor
- Source: https://github.com/microsoft/monaco-editor
- License: MIT — Copyright (c) 2016 - present Microsoft Corporation
- Full text: `vendor/vs/LICENSE`
- Version bundled: 0.45.0

## JSZip
- Source: https://github.com/Stuk/jszip
- License: dual MIT / GPLv3 (used here under MIT)
- Version bundled: 3.10.1

## xterm.js
- Source: https://github.com/xtermjs/xterm.js
- License: MIT — Copyright (c) 2017-2019 The xterm.js authors, 2014-2016 SourceLair Private Company, 2012-2013 Christopher Jeffrey
- Full text: `vendor/xterm/LICENSE`
- Version bundled: 6.0.0 (core, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-search`)
- Used for the Terminal panel's UI only — the terminal *emulator display*. It renders whatever
  text a shell process sends it; it isn't itself a shell and doesn't run commands.

All of the above are used only as client-side libraries; none of them transmit any data anywhere.

## ws (server-side only, optional)
- Source: https://github.com/websockets/ws
- License: MIT
- Not vendored — installed via `npm install` as a regular `dependencies` entry. Only ever runs
  locally (`node server.js` / `npm run dev`); never part of a static deploy.

## node-pty (server-side only, optional)
- Source: https://github.com/microsoft/node-pty
- License: MIT
- Not vendored — installed via `npm install` as an `optionalDependencies` entry (CodeForge works
  fine without it; see `README.md`). Only ever runs locally; never part of a static deploy.

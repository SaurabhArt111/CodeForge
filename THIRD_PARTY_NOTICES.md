# Third-party notices

CodeForge itself is MIT licensed. It bundles or derives from the following. Full license texts are shipped next to
the vendored files (`app/src/main/assets/www/vendor/*/LICENSE`) or are available from the linked upstream projects.

| Component | License | Use |
|---|---|---|
| Termux `terminal-emulator` PTY approach (`app/src/main/cpp/pty.c`) — github.com/termux/termux-app | Apache-2.0 | JNI pseudo-terminal implementation derived from Termux |
| Termux:Styling colour schemes & fonts — github.com/termux/termux-styling | Apache-2.0 | terminal colour schemes |
| Acode — github.com/Acode-Foundation/Acode | MIT | proot launch/rootfs approach; prebuilt `libproot*.so`, `libtalloc.so` binaries |
| PRoot (`libproot*.so`) — proot-me.github.io | GPL-2.0-or-later | bundled prebuilt binary, run as a separate process. Source: https://github.com/proot-me/proot |
| talloc (`libtalloc.so`) — talloc.samba.org | LGPL-3.0-or-later | bundled shared library. Source: https://www.samba.org/ftp/talloc/ |
| Visual Studio Code — github.com/microsoft/vscode | MIT | default themes, file icon mapping (Seti), snippets, language configurations (harvested from the repository; see `docs/VSCODE_ThirdPartyNotices.txt`) |
| Seti UI icons — github.com/jesseweed/seti-ui | MIT | file icons |
| Monaco Editor 0.52.2 | MIT | editor |
| xterm.js 5.5 (+ fit, search, web-links, unicode11 addons) | MIT | terminal emulator UI |
| isomorphic-git | MIT | Git implementation in JavaScript |
| buffer, base64-js, ieee754 | MIT | Node `Buffer` polyfill |
| JSZip | MIT or GPL-3.0 (dual) — used under MIT | ZIP handling in the UI |
| marked | MIT | Markdown preview |
| Prettier 3 (standalone + plugins) | MIT | code formatting |
| Emmet | MIT | abbreviation expansion |
| Codicons — github.com/microsoft/vscode-codicons | CC-BY-4.0 (icons), MIT (code) | UI icons |
| JetBrains Mono | OFL-1.1 | font |
| Cascadia Code | OFL-1.1 | font |
| Fira Code | OFL-1.1 | font |
| androidx.webkit 1.11.0 | Apache-2.0 | WebViewAssetLoader / WebMessageListener |

Extensions downloaded at runtime from Open VSX remain under their authors' licenses.

If you redistribute an APK, you must make the corresponding source of the GPL/LGPL components above available
(the upstream links are sufficient for unmodified binaries) and keep these notices.

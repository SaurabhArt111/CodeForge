# Third-party software bundled with CodeForge

CodeForge bundles two open-source libraries locally so the whole app works offline,
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

Both are used only as client-side libraries; neither transmits any data anywhere.

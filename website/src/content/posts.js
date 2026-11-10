// Blog posts: short notes on why things work the way they do.
export const POSTS = [
  { id: "extensions-on-a-phone", date: "November 2026", title: "What a VS Code extension can do on a phone",
    body: [
      "VS Code runs extensions in a Node.js process on your computer. An extension can start other programs, load native code and open network sockets. A phone app cannot offer that process, so CodeForge takes a different route.",
      "Declarative parts of an extension work everywhere: themes, icon themes, snippets, language configuration, JSON schemas. CodeForge reads them from the package and applies them.",
      "Extension code runs in a sandboxed worker with the parts of the VS Code API that make sense there: commands, messages, the status bar, completions, hovers, formatting, diagnostics, tree views and webview views. An extension that adds a container to the activity bar gets its icon there.",
      "Extensions built around a desktop process, such as language servers, debuggers, Docker tooling or the official Claude Code and Codex extensions, cannot start. CodeForge says so in the extension's details instead of failing silently. For the AI tools there is a direct replacement: the same CLIs run in the Linux terminal, and the AI side bar has a tab for each.",
    ] },
  { id: "keyboard-asks-first", date: "November 2026", title: "Why the keyboard asks first",
    body: [
      "On a phone the keyboard covers almost half the screen. In most editors every tap on the code opens it, even when you only wanted to scroll, read or place the cursor.",
      "CodeForge separates the two. A tap moves the cursor and shows a small prompt. The keyboard opens when you tap the prompt or the floating button. If you prefer the usual behaviour, one setting restores it.",
      "The same rule applies to the terminal, so reading long output is no longer a fight with the keyboard.",
    ] },
  { id: "linux-without-root", date: "November 2026", title: "Real Linux on Android, without root",
    body: [
      "The Linux terminal is Alpine Linux started through PRoot, which translates file paths so a normal app can run a Linux userland. No root access and no custom ROM are involved.",
      "Inside it you have apk, Node.js, npm, Python, Git and compilers. Dev servers started there are reachable from the in-app preview and from your browser.",
      "The approach comes from Termux and Acode, which showed how far this can go on Android. Their work is credited on the About page.",
    ] },
];

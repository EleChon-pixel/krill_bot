# krill_bot

A Violentmonkey helper for Krillion Puffer Party: historical answer lookup, local word matching, optional Qwen3 suggestions, and live answer tracking. **You submit every answer manually.**

## Features

- Historical examples from a public Daily Dive dataset, visited guide pages, and answers you save manually.
- Local word suggestions for recognized prefix, suffix, containment and numeric-length rules.
- Optional local Ollama generation with `qwen3:8b`; no cloud model required.
- Party snapshot/patch tracking, submit acknowledgements and category-aware accepted/rejected states.
- Dark panel with tier colours, readable state chips and feed diagnostics.
- Click or use **Alt+1–5** to fill the answer input. Filling never submits.

Historical scores are not predictions of the current Party score. Dictionary and model suggestions may be rejected by the game. This is an independent project, unaffiliated with Krillion or Violentmonkey.

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/get-it/) in your browser.
2. Open [`krill_bot.user.js`](krill_bot.user.js) and copy its complete contents.
3. Create a script in the Violentmonkey dashboard, paste the contents, and save.
4. **Fully reload the Krillion tab** so network hooks attach to new game connections.

**Updating the earlier YŌKAI script:** edit that existing script instead of creating another copy. Its internal name and namespace are deliberately unchanged to preserve Violentmonkey storage. Keep only one copy enabled. The repository name is `krill_bot`; the panel still displays YŌKAI.

### Optional local AI

With [Ollama](https://ollama.com/) installed and running, pull the configured model:

```bash
ollama pull qwen3:8b
```

The userscript connects to `http://127.0.0.1:11434`. It requests structured JSON with thinking disabled. Archive/dictionary suggestions work without Ollama. Use **Warm 8B** or **Unload 8B** to manage model loading. The endpoint and model are defined in `CFG` near the top of the script.

## Controls

| Control | Action |
| --- | --- |
| Click a suggestion / Alt+1–5 | Fill the input; submit it yourself |
| Regenerate | Skip the displayed suggestions and select alternatives |
| Save official | Save answers copied from your official Archive view |
| Open guide | Open the guide; visited dated pages can be imported |
| Clear records | Clear tracked states for the current category |
| Diagnostics | Check hooks, round identity, feed capture and confirmation evidence |

Accepted, pending and rejected answers appear directly in the panel. Unknown observations remain separate. Tier colours include labels; historical suggestion tiers and actual accepted tiers are kept separate.

## Data and permissions

The script runs on `krillion.io`, `www.krillion.io`, and dated answer-guide pages under `krilliongame.com/krillion-answers/`.

- It observes game messages and relevant page elements to maintain answer state.
- Category and candidate text is sent to local Ollama when generation is needed.
- Violentmonkey downloads the declared word-list and archive resources from GitHub. The archive can refresh in the background once per day.
- Imported guide/official answers and archive caches stay in Violentmonkey storage. They are not included in this repository.
- It does not submit answers, send room actions, or retain game authentication tokens. The protocol adapter keeps only the room fields it needs, excluding player records and chat.

## Development

Use Node.js 24 or newer. There are no npm dependencies and no install/build step.

```bash
git clone https://github.com/EleChon-pixel/krill_bot.git
cd krill_bot
npm run check
```

`npm run check` checks userscript syntax and runs the regression suite. Tests execute the distributed script directly and exercise browser orchestration with deterministic web API/DOM mocks. CI runs the same command.

## Status and limitations

The Party adapter follows public client JavaScript inspected on **2026-11-04**. The 47 regression tests cover its observed message shapes, round transitions, pending recovery, delayed responses, tier rendering and colour contrast. This is **not evidence of a verified live Violentmonkey session**. Browser injection and future game changes can affect tracking.

If tracking is empty, fully reload the tab, open **Diagnostics**, and check the feed indicator. A hook marked installed does not prove it captured traffic. Missing patch history waits for a full snapshot rather than guessing. The literal word parser does not understand every possible English restriction.

See [implementation notes](docs/implementation.md) for the detailed changelog, protocol references and limitations. To report a problem, include the version, browser, Violentmonkey version and a redacted example. Do not post player keys, auth tokens, room invite links or private chat.

## Sources and license

- [Word-frequency resource](https://github.com/first20hours/google-10000-english).
- [Daily Dive dataset](https://github.com/StruggleYang/krillion-dataset).
- [Visited answer-guide pages](https://krilliongame.com/krillion-answers/).

External datasets, guide content and game assets are not vendored here. Their ownership and terms remain with their respective sources. This repository's code is available under the [MIT License](LICENSE).

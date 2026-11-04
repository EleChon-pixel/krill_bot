# Krill Bot 8.1.2

Version 8.1.2 adds public Krillion Puffer Party naming, direct install/update URLs, and a GitHub Pages landing page with installation and optional local-AI guides. The userscript keeps `@name krill_bot` and `@namespace krill_bot.local` so existing managers can recognize its identity. Only metadata and the visible panel heading change in the distributed script; answer generation and tracking behavior are unchanged. See [website operations](website.md).

The installable userscript is `krill_bot.user.js`. No build step or extra JavaScript packages are needed.

## Install over version 7.5

1. Open Violentmonkey's dashboard and edit the existing **krill_bot** script.
2. Replace its contents with the complete contents of `krill_bot.user.js`, then save.
3. Reload your Krillion tab. Keep only one copy of the helper enabled.

Version 8.1.1 renames the script, namespace, panel, log prefix and cache keys to `krill_bot`. Edit the existing installation to keep its script storage. When an old cache is available in that storage, it is copied to the new key on first access without deleting the original. Separate installations have separate storage; back up/export the previous installation before replacing it. Cached records are validated before loading.

Ollama remains at `http://127.0.0.1:11434`, using `qwen3:8b`. The script requests structured JSON with thinking disabled. Your installed Ollama/model must support those options. Nothing is submitted to the game automatically.

## Version 8.1 fixes

The public Party client was inspected on 2026-11-04. Version 8.0 assumed generic round IDs and USED-list markup; the current client instead uses room snapshots/patches, category indices, and pass/reject events. Version 8.1 adds a specific adapter for that implementation.

- Reads WebSocket `snap`, versioned `patch`, and correlated submit `ack` packets. Also listens for the named SSE `room` event, not just `message`.
- Tracks categories by room code, game number and category index. Processes ordered event history so the final answer before a category change does not enter the new category. Stale snapshots, missing patch bases and old connections are rejected. The adapter never sends a sync request or any other game action.
- Uses the actual `.pf-root .ds-card .prompt` selector, with the earlier heuristic as fallback. Network category state prevents a delayed DOM animation from reverting to the preceding prompt.
- Keeps live accepted tiers separate from historical suggestion scores. Another player's rejected guess remains an observation; it does not automatically blacklist a candidate.
- Accepted, pending and rejected chips are visible in the main panel. The tracking feed indicator distinguishes captured Party data from merely installed hooks. Symbols and labels accompany all state colours.
- Uses the game's six tier colours: Plankton grey, Too Clever orange, Schooler cyan, Rare red, Deep Cut purple, One in a Krillion gold. Colour calculations pass 4.5:1 contrast on both chip and answer backgrounds.
- Fixes text inheritance under dark mode: the section explicitly sets its font, foreground and background, so the host's `all: initial` reset cannot make text black. No site-wide theme changes are made.

Public implementation references: [room transport](https://krillion.io/_next/static/chunks/1njwws5-t37de.js), [Party rendering and event handling](https://krillion.io/_next/static/chunks/3w4cs-gkk90z8.js), [tier palette](https://krillion.io/_next/static/chunks/411g_qifdhu85.js). These asset names may change with deployment. No room was joined and no answer was submitted while investigating.

## Retained changes

- Candidates remain stored throughout the round. Pending expiry restores eligibility; higher-ranked historical answers do not destroy displaced candidates.
- **Regenerate** skips currently displayed candidates and selects alternatives. **Clear records** clears accepted, rejected, pending and observed states, preserving deliberate Regenerate skips. A visible game's USED list can confirm a cleared answer again on the next scan.
- Round and route tokens discard late HTTP, Blob and model completions. New tagged rounds are buffered until their question matches the displayed prompt, or an unambiguous prompt transition allows association. Previously bound round IDs are retired until the room route changes.
- Untagged answer traffic is uncertain even when it contains an acceptance flag. Generic event names, `success`, and `valid` alone do not establish acceptance. Exact `accepted` markers and explicitly named used/accepted lists require a matching round. Observed-only answers are never suggestions unless independently supplied by a candidate source.
- DOM confirmation uses a visible, exact USED label and a local list/chip container, or a leaf `USED: ...` label. Random `data-answer` attributes elsewhere do not confirm use. Flattened comma-separated text remains uncertain because titles can contain commas.
- A snapshot of the preceding round's USED entries prevents an unchanged old list from contaminating the new round. Repeated entries stay fenced until the visible list clears, or a correctly tagged network event confirms them in the new round. This favors missing an uncertain confirmation over assigning it to the wrong round.
- Answer identity preserves articles, accents and punctuation. Question lookup still uses the historical normalized question key for cache compatibility.
- Recognized prefix, suffix, contains and numeric-length word rules are combined. Equal-length literal matches are allowed. A frequency-list match is labelled as such; it is not proof of game acceptance.
- Score-only official-answer edits are saved, including edits that add no new answer.
- Cached DOM references, debounced observation, batched animation-frame rendering and a display signature reduce scanning and button replacement. A periodic fallback checks for navigation and replaced containers; broad prompt scans occur at most every ten seconds while the cached prompt remains usable.
- Fetch interception is limited to recognizable game paths and Socket.IO endpoints. Cloned fetch bodies are read with a byte cap even without Content-Length; monitoring preserves the game's original promise and response. Native XHR buffering is controlled by the browser; the helper bounds its own parsing.
- Each network hook installs independently. Diagnostics show injection context, hook installation failures, round binding, located USED container and last confirmation evidence. Guide import also watches briefly for delayed page content.
- Model loading is demand-driven when local candidates cannot fill the panel. Manual warm/unload controls remain. The panel uses a Shadow DOM to isolate styles and can collapse.

## Validation and limitations

Syntax checking and 50 dependency-free regression tests pass. Run them directly:

```bash
node --check krill_bot.user.js
node krill_bot.test.cjs
```

The tests exercise the actual distributed file, including its browser orchestration under deterministic web API mocks. They cover round races, route changes, delayed Blob/model responses, pending recovery, rejection, archive promotion, official score edits, normalization, combined spelling rules, transport limits, hook failures and conservative DOM confirmation.

This version has **not been validated in the user's real Violentmonkey/Krillion session**. The current public JavaScript schema was inspected; protocol tests use fixtures matching that code, and rendering tests use DOM mocks rather than a real browser screenshot. Hook installation does not establish that the browser exposed game traffic. A socket created before installation, a saved native constructor, a Worker, binary packets, SSE events other than `message`/`room`, or a different HTTP endpoint may not be observed.

The specific Party adapter uses room/game/category identity; the generic fallback still requires explicit round identity for hard confirmation. It cannot infer the true round of an untagged delayed socket event. If several IDs could match a transition, none is bound. Unknown schemas should be adapted using the actual event structure rather than widening acceptance heuristics.

The word parser covers the documented literal forms, not arbitrary English restrictions such as “contains exactly two vowels,” exclusions, or “starts with S or T.” Review suggestions against the whole prompt. Historical scores and model outputs remain unverified for the current Party game.

For a live smoke check, open **Diagnostics**, confirm the prompt changes with the category, fill a suggestion and submit it manually, then compare Answer tracking with the game's visible USED list. Check a repeated category and a room change as well. No game API probes or automatic submissions are part of this package.

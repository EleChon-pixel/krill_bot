# Website and discovery

Public site: <https://elechon-pixel.github.io/krill_bot/>

The website is plain HTML/CSS in `site/`, with no build dependencies, client JavaScript, analytics scripts, or added tracking cookies. GitHub serves the pages and script download. All essential content and links are present in the delivered HTML. The homepage panel is an illustration with sample content, not a live-game screenshot. No video or live browser compatibility claim is made.

## Local preview and checks

From the repository root:

```bash
npm run check
python3 -m http.server 8000 --directory site
```

Open <http://localhost:8000/>. The custom 404 page uses the deployed `/krill_bot/` prefix, so its links should be checked against the deployed site. Stop the server with Ctrl+C. `npm run check:site` verifies page metadata, sitemap coverage, local links and fragment targets, install links, update metadata, and social-image dimensions.

## Publishing

`.github/workflows/pages.yml` checks the project on a push to `main`, uploads only `site/`, and deploys with GitHub Pages. The repository's Pages publishing source must be **GitHub Actions**. Each third-party action is pinned to a commit. Existing script CI remains in `check.yml`.

The userscript retains `@name krill_bot` and `@namespace krill_bot.local` to preserve its manager identity. Its public description, README, panel heading, and website use Krill Bot and Krillion Puffer Party. Direct install and update URLs point to the main-branch `.user.js`; keep only one script enabled. A working HTTP download is not verification of the browser's installation prompt.

## Search topics

These are initial editorial hypotheses, not verified search volumes or difficulty estimates. Each page serves a different practical need rather than duplicating a keyword list.

| Page | Primary intent | Natural search phrases |
| --- | --- | --- |
| `/krill_bot/` | Understand the tool and start installation | Krillion cheat, Krillion bot, Puffer Party answer helper |
| `/krill_bot/install/` | Install, update, or fix the browser script | Krillion userscript, Krillion Violentmonkey |
| `/krill_bot/local-ai/` | Add optional local generation | Krillion Ollama, local AI Krillion helper, Qwen3 Krillion |

Each indexable page has a distinct title, description, H1, canonical URL, Open Graph metadata, and Twitter card. Main navigation, content links, and footer links connect the pages. `sitemap.xml` lists the three canonical pages; `404.html` is marked `noindex`. The social card is an original vector composition rasterized to a 1200×630 PNG; it is not a game screenshot or borrowed game asset.

GitHub project Pages cannot own the origin's `/robots.txt`; that path is shared by all project sites on the account. A `site/robots.txt` would publish under `/krill_bot/robots.txt` and would not control origin crawling. The sitemap can be submitted directly in Search Console without adding a misleading project-level robots file.

## Search Console and measurement

After publication, add a URL-prefix property for `https://elechon-pixel.github.io/krill_bot/` in [Google Search Console](https://search.google.com/search-console/). Use the verification method Google provides for the signed-in owner. An HTML verification file can be placed in `site/`, or the supplied meta tag can be added to the homepage. Never invent a verification token.

Submit `https://elechon-pixel.github.io/krill_bot/sitemap.xml`, inspect the homepage, and request indexing if available. These account actions require access to the owner's Search Console; deployment alone does not establish verification, indexing, or ranking. No Search Console verification or indexing submission is claimed by these source files.

Review actual search impressions, clicks, and query relevance after enough data accumulates. This site does not collect installation-click analytics. Userscript downloads, repository views, stars, and actual successful installations are different measures; do not report one as another. Avoid score promises, invented live-session results, keyword stuffing, and generated duplicate guide pages.

## Sources

- [Google Search Essentials](https://developers.google.com/search/docs/essentials)
- [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Violentmonkey metadata identity and updates](https://violentmonkey.github.io/api/metadata-block/)
- [Official Violentmonkey downloads](https://violentmonkey.github.io/get-it/)
- [Ollama quickstart](https://docs.ollama.com/quickstart)
- [Qwen3 8B model](https://ollama.com/library/qwen3:8b)

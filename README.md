# Machine Gods — teaser page

Single-file site. Everything (artwork, logos, NPR mark) is inlined in `index.html`; fonts load from Google Fonts.

## Publish to GitHub Pages
1. Create a new repo on github.com (e.g. `machinegods-teaser`), public.
2. Upload these three files to the repo root (drag-and-drop on the repo page works — include `.nojekyll`).
3. Repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / `/ (root)` → Save.
4. The page goes live at `https://<user>.github.io/<repo>/` in ~1 minute.

## Custom domain (optional)
Add a file named `CNAME` containing just `machinegods.com` (or the subdomain you want), then set the same domain in Settings → Pages and add the DNS records GitHub lists there.

## Updating
Replace `index.html` with the latest export, then re-apply the signup wiring, hosts photo, and listen links before committing:

```
node tools/patch-signup.js index.html "<APPS_SCRIPT_EXEC_URL>" --photo assets/hosts.jpg --links tools/links.json --launched
```

The same command also adds the "Ask a question / Read the transcripts" buttons and footer links, points the share tags at machinegods.fm, and clears the old "week of October 19" copy. Add `--launched` as well: it swaps the export's "First episode drops October 21" line for "New episodes / Twice a week". The live page has been in launched mode since 2026-10-20, so leaving the flag off brings the old date back.

The script also swaps the export's built-in favicon for the shared icon set (`favicon.ico` at the root, plus `assets/brand/favicon.svg` and `assets/brand/apple-touch-icon.png`), which `/ask` and `/transcripts` use too. To change the favicon, replace those three files.

The export ships with a stub submit handler (`/* TODO: POST to your list provider */`) and placeholder listen URLs (`TODO-...`), so a fresh export that is pushed without this step will silently drop signups and ship dead podcast links. The script is safe to re-run on an already-patched page.

## Listen links
`tools/links.json` maps each button label in the "Follow the show here" row to its URL. Set a value to `null` to remove that button. To change a link (e.g. once the Apple Podcasts ID exists), edit the JSON and re-run the command above — no need to touch `index.html` by hand. The script warns if any button is still on a `TODO` placeholder.

## Newsletter signups
Signups go to beehiiv (https://machinegods.beehiiv.com). `assets/newsletter.js` is a popup that loads beehiiv's "machinegods.fm modal" subscribe form (beehiiv → Audience → Subscribe forms) in an iframe. Change the form's colors and fields in beehiiv, and the popup's headline and copy in `newsletter.js`.

- It opens from the homepage's Subscribe button, any "Newsletter" link (anything with `data-newsletter` or `href="#newsletter"`), and the shareable link https://machinegods.fm/#newsletter.
- It also opens on its own, once per visitor, after 15 seconds or halfway down the page, on the homepage and transcript pages (not `/ask`). Closing it keeps it from opening on its own again for 30 days on that browser.
- The patch script replaces the export's original email box (which posted to the Google Sheet via `tools/Code.gs`) with the Subscribe button. The Sheet no longer receives new signups. The `<APPS_SCRIPT_EXEC_URL>` argument is still required by the script, but nothing uses it now.

## Transcripts
`/transcripts/` is plain HTML generated from Markdown, so it's readable without JavaScript and indexable by search engines (unlike the homepage export).

1. Export the transcript from the Machine Gods transcriber as Markdown and save it as `transcripts/src/ep-01.md` (any name ending in `.md`).
2. Resolve every `[[uncertain]]` marker. The build refuses to publish while any remain. The transcriber's note, flag count and "Review list" are stripped automatically.
3. Add front matter at the top:
   ```
   ---
   episode: 1
   title: Episode title
   date: 2026-10-21
   description: One or two sentences for the listing and link previews.
   apple: https://podcasts.apple.com/...   (optional; also spotify, youtube, npr)
   ---
   ```
4. Optional: save square episode art as `assets/episodes/ep-NN.jpg` (~1400px; the NPR feed has it) and add `image: /assets/episodes/ep-NN.jpg`.
5. `node tools/build-transcripts.js`, then commit `transcripts/`, `assets/episodes/` and `sitemap.xml`.

The page lives at `/transcripts/<episode>/`. Styles are shared with `/ask` in `assets/site.css`; brand images extracted from the export live in `assets/brand/`.

## Listener questions
`/ask/` posts to a Cloudflare Worker, `tools/questions-worker.js` (same setup as the kevinroose.com contact form). The worker emails each question to hey@machinegods.fm through Resend, with Reply-To set to the listener. It runs in Kevin's Cloudflare account as `machinegods-form` at https://machinegods-form.kbroose.workers.dev/. To change it, paste the updated file into the dashboard editor and redeploy. Deploy steps are in the file header.

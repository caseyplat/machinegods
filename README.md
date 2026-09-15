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
Replace `index.html` with the latest export, then re-apply the signup wiring before committing:

```
node tools/patch-signup.js index.html "<APPS_SCRIPT_EXEC_URL>"
```

The export ships with a stub submit handler (`/* TODO: POST to your list provider */`), so a fresh export that is pushed without this step will silently drop signups.

## Email signups
The subscribe box posts to a Google Apps Script web app (`tools/Code.gs`) that appends each address to the "Machine Gods signups" Google Sheet. Setup and export instructions are in the header of that file. `tools/patch-signup.js` wires the widget to the deployed script URL; re-run it with a different URL to point the form at a newsletter platform later.

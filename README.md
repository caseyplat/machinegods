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
Replace `index.html` with the latest export and commit.

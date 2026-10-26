# TEST-site branding

Icons used only by the test site (omri-wiki-game-test.netlify.app), so it looks
different from production on a phone home screen ("Wiki Test", amber icon with a TEST badge).

They are **not** in `public/`, so production never ships them. The `test-site-branding` plugin in
`vite.config.js` copies them into `dist/` and swaps the manifest / `index.html` names and icons
**only** when the build runs with `WIKIGAME_ENV=test`. That variable is set on the test Netlify site
only. Production has no such variable, so its build output is byte-identical with or without this folder.

So merging test → main is safe: the code arrives on main but stays inactive there.

Regenerate the icons after changing the production icons: `python3 env-test/make-icons.py`

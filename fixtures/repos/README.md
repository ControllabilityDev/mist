# Fixture repositories (EPIC-06)

Two synthetic npm projects used to prove the Mist Index works on something that
is not Mist, and that it does not collapse into a package count.

`ordinary-app` and `scripted-app` have **the same number of packages**. They
differ only in how many of those packages run install scripts. If the index
scored them identically it would be a package counter wearing a costume, which
is falsification criterion 1 in `docs/MIST_INDEX.md`.

Each carries `package.json` and `package-lock.json` only. There is no
`node_modules` here — it is gitignored repo-wide, and committing a fake one
would confuse `scripts/check-wx.mjs` and the scan battery. `A1` needs only the
lockfile; `scripts/test-mist-index.mjs` synthesises a small `node_modules` in a
temp directory when it needs `A2`.

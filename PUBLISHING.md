# Publishing — manual steps required once

This package's release workflow (`.github/workflows/release.yml`) is the
only path that may publish to npm. Nothing in it can be finished by an
agent working from a local checkout — it needs a real GitHub repo with
push access, a real npmjs.com login, and a browser to configure trusted
publishing. Do these once, in order:

## 1. Push this repo

From this checkout:

```
git push -u origin main
```

The remote (`https://github.com/still-running-dev/Workflow-Health-Check.git`)
already exists and is empty.

## 2. Configure npm trusted publishing (blocks local `npm publish` too)

`1.0.0`/`1.0.1` were published with a local `npm publish` from inside the
old monorepo. That path needs to close now that CI is the source of truth.

On [npmjs.com](https://www.npmjs.com), on the `@still-running/health-check`
package's **Settings → Publishing access**:

1. Add a trusted publisher: GitHub Actions, repo
   `still-running-dev/Workflow-Health-Check`, workflow file
   `release.yml`, environment left blank (this workflow doesn't use one).
2. Set publishing access to **require** the trusted publisher — this is
   what actually rejects a local `npm publish` from anyone's laptop, not
   just an unenforced preference.

No `NPM_TOKEN` secret is needed anywhere — that's the point of trusted
publishing. Don't add one to the repo's Actions secrets.

## 3. Cut the 2.0.0 release

Tag and publish a GitHub Release named `v2.0.0` (matching the `version` in
`package.json`). That `release: published` event is what triggers the
workflow. Watch the Actions run — it runs `typecheck`, `test`, and `build`
before `npm publish`, so a real failure there blocks the publish rather than
shipping broken.

## 4. Confirm it actually published

```
npm view @still-running/health-check version
```

should print `2.0.0`. If it still shows `1.0.1`, the release workflow
didn't complete — check the Actions log before doing anything downstream.

## 5. Come back to `stillrunning-api` and verify the real install

That repo's `package.json` already pins `"@still-running/health-check":
"2.0.0"` (exact, no `^`) as of this change. From `stillrunning-api`:

```
rm package-lock.json
npm install
```

should resolve `2.0.0` cleanly from the registry with no local fallback and
no error. This is the check CLAUDE.md's former "Known gap" section
described — now against the new repo instead of an unpublished one.

## 6. Only after step 5 passes: remove the prod-exit path in `main.ts`

`stillrunning-api/src/main.ts` still has the block that calls
`process.exit(1)` when `NODE_ENV=prod` and the fallback analyzer got
selected (see `resolve-workflow-health-check-analyzer.ts`). That block was
deliberately left in place by this change — it's gated on step 5 actually
passing, not on this file existing. Once `npm install` above is clean:

- Remove the `if (isProduction() && !workflowHealthCheckStatus.available)`
  block from `bootstrap()` in `main.ts`.
- Keep `UnavailableWorkflowHealthCheckAnalyzer` itself — it's still the
  right fallback for local dev without the package installed, and
  `GET /health`'s `workflowHealthCheck` field and the `degraded` status
  still need it to report accurately.

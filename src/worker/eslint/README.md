# ESLint Build

## Rule Validation Patch

Since Monaco switched to blobs for workers in >= 0.51.0, ESLint now needs `unsafe-eval` to verify the ESLint rules in the config (using new Function()). This is because web workers do not inherit the origin's CSP if they are normal files, but they do if they are blobs (see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy). Because of this we need to disable the rule validation to allow strict CSPs and we do that with a little patch to `lib/config/rule-validator.js` in ESLint before we build. The patch just replaces the actual compilation function with a noop dummy (see `disable-rule-validation.patch`). The custom setting `disableRuleValidation` is then set to `true` when creating the linter in `eslint-worker.ts`.

## Building ESLint

> [!NOTE]
> Ideally clone ESLint into a sibling folder to this project so all the steps work without changes to paths.

Make sure you have the latest sources by either cloning or pulling on the branch `latest` and ran `npm install`, e.g.:

```sh
git clone https://github.com/eslint/eslint.git
cd eslint
git switch latest
npm install
```

Apply the patch, build and copy the build result over

```sh
git apply ../monaco-playground/src/worker/eslint/disable-rule-validation.patch
npm run build:webpack
cp build/eslint.js ../monaco-playground/src/worker/eslint
```

> [!NOTE]
> To build a minified version use `npm run build:webpack -- -- production` instead.

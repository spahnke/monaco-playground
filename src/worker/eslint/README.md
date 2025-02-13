# ESLint Build

## Rule Validation Patch

Since Monaco switched to blobs for workers in >= 0.51.0, ESLint now needs `unsafe-eval` to verify the ESLint rules in the config (using new Function()). This is because web workers do not inherit the origin's CSP if they are normal files, but they do if they are blobs (see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy). Because of this we need to disable the rule validation to allow strict CSPs and we do that with a little patch to `lib/config/rule-validator.js` in ESLint before we build. The patch just replaces the actual compilation function with a noop dummy.

```diff
diff --git a/lib/config/rule-validator.js b/lib/config/rule-validator.js
index 3b4ea6122..c0c7051cc 100644
--- a/lib/config/rule-validator.js
+++ b/lib/config/rule-validator.js
@@ -153,7 +153,7 @@ class RuleValidator {
                     const schema = getRuleOptionsSchema(rule);

                     if (schema) {
-                        this.validators.set(rule, ajv.compile(schema));
+                        this.validators.set(rule, config.settings?.disableRuleValidation ? () => { } : ajv.compile(schema));
                     }
                 } catch (err) {
                     throw new InvalidRuleOptionsSchemaError(ruleId, err);
```

The custom setting `disableRuleValidation` is then set to `true` when creating the linter in `eslint-worker.ts`.

## Building

To build ESLint run the following steps:

```sh
git clone https://github.com/eslint/eslint.git
cd eslint
git switch latest
npm install
npm run build:webpack
```

The built file will be in `./build/eslint`.

To build a minified version instead, run

```sh
npm run build:webpack -- -- production
```

Copy the resulting file here.

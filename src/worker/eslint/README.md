# ESLint Build

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

Then patch the Webpack config, build, and copy the build result over. The patch is necessary because ESLint gets loaded
as an ES module where `this` is `undefined`, so we need to replace it with `globalThis`.

```sh
git apply ../monaco-playground/src/worker/eslint/global-this.patch
npm run build:webpack
cp build/eslint.js ../monaco-playground/src/worker/eslint
```

> [!NOTE]
> To build a minified version use `npm run build:webpack -- -- production` instead.

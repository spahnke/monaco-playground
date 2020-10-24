# ESLint Build

To build ESLint run the following steps:

```sh
git clone https://github.com/eslint/eslint.git
cd eslint
npm install
npm run webpack
```

The built file will be in `./build/eslint`.

To build a minified version instead, run

```sh
npm run webpack -- -- production
```

Copy the resulting file here and replace the UMD header with

```js
(function webpackUniversalModuleDefinition(root, factory) {
  root["eslint"] = factory();
})(self, function() {
```

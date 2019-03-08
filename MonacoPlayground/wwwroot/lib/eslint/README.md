To build run the following steps:
```sh
git clone https://github.com/eslint/eslint.git
cd eslint
npm install
npm run webpack
```
The built file will be in `./build/eslint`.

For an ES5 version:
```sh
git clone https://github.com/eslint/eslint.git
cd eslint
git checkout v5.14.1
npm install
npm run browserify
```

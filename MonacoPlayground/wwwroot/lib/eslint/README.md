To build run the following steps:
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

For an ES5 version change the `rules` object in the `webpack.config.js` as follows
```js
{
	test: /\.m?js$/u,
	loader: "babel-loader",
	options: {
		presets: ["@babel/preset-env"]
	}
}
```

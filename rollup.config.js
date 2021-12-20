import { readdirSync } from "fs";
import { join, resolve } from "path";
import copy from "@guanghechen/rollup-plugin-copy";
import typescript from "@rollup/plugin-typescript";

const commonPlugins = [
	typescript({
		tsconfig: "src/tsconfig.json",
	}),
];

function getFilenames(path) {
	const fileNames = readdirSync(path);
	return fileNames.map(fileName => join(path, fileName));
}

export default [
	{
		input: "src/app.ts",
		output: {
			dir: "wwwroot/dist",
			format: "es",
			sourcemap: true,
		},
		plugins: [
			copy({
				copyOnce: true,
				flatten: false,
				targets: [
					{ src: "node_modules/monaco-editor/", dest: "wwwroot/lib/" },
				],
			}),
			copy({
				copyOnce: false,
				flatten: false,
				targets: [
					{ src: "src/languages/**/*.json", dest: "wwwroot/" },
					{ src: "src/index.html", dest: "wwwroot/" },
					{ src: "src/styles.css", dest: "wwwroot/" },
				],
			}),
			...commonPlugins,
		]
	},
	{
		input: [
			"src/worker/eslint/eslint-worker.ts",
		],
		output: {
			dir: "wwwroot/worker",
			format: "amd",
			sourcemap: true,
		},
		external: [resolve(__dirname, "src/worker/eslint/eslint.js")],
		plugins: [
			copy({
				copyOnce: true,
				targets: [
					{ src: "src/worker/eslint/eslint.js", dest: "wwwroot/worker/" },
				],
			}),
			...commonPlugins,
		]
	},
	{
		input: [...getFilenames("src/rules")],
		output: {
			dir: "wwwroot/rules",
			format: "amd",
			sourcemap: true,
		},
		plugins: commonPlugins
	}
]
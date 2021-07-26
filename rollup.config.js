import copy from "rollup-plugin-copy";
import typescript from "@rollup/plugin-typescript";

const commonPlugins = [
	typescript({
		tsconfig: "src/tsconfig.json",
	}),
];

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
					{ src: "src/languages/**/*.json", dest: "wwwroot/" },
					{ src: "src/index.html", dest: "wwwroot/" },
				],
			}),
			...commonPlugins,
		]
	},
	{
		input: "src/languages/javascript/worker/eslint-worker.ts",
		output: {
			dir: "wwwroot/worker",
			format: "amd",
			sourcemap: true,
		},
		plugins: commonPlugins
	},
	{
		input: [
			"src/languages/javascript/worker/rules/no-id-tostring-in-query.ts",
		],
		output: {
			dir: "wwwroot/worker/rules",
			format: "amd",
			sourcemap: true,
		},
		plugins: commonPlugins
	}
]
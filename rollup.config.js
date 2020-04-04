import typescript from "@rollup/plugin-typescript";

const plugins = [
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
		plugins
	},
	{
		input: "src/languages/javascript/worker/eslint-worker.ts",
		output: {
			dir: "wwwroot/worker",
			format: "amd",
			sourcemap: true,
		},
		plugins
	}
]
import typescript from "rollup-plugin-typescript";
import { terser } from "rollup-plugin-terser";

const isProduction = process.env.ROLLUP_WATCH !== "true";

const plugins = [
	typescript({
		tsconfig: "src/tsconfig.json",
	}),
	isProduction && terser()
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
		external: ["/lib/eslint/eslint.js"],
		plugins
	}
]
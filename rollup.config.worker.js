import typescript from "rollup-plugin-typescript";
import { terser } from "rollup-plugin-terser";

const isProduction = process.env.ROLLUP_WATCH !== "true";

export default {
	input: "src/languages/javascript/worker/eslint-worker.ts",
	output: {
		dir: "wwwroot/worker",
		format: "amd",
		sourcemap: true,
	},
	external: ["/lib/eslint/eslint.js"],
	plugins: [
		typescript({
			tsconfig: "src/tsconfig.worker.json",
		}),
		isProduction && terser()
	],
}
import typescript from "rollup-plugin-typescript";
import { terser } from "rollup-plugin-terser";

const isProduction = process.env.ROLLUP_WATCH !== "true";

export default {
	input: "src/app.ts",
	output: {
		dir: "wwwroot/dist",
		format: "es",
		sourcemap: true,
	},
	plugins: [
		typescript({
			tsconfig: "src/tsconfig.json",
		}),
		isProduction && terser()
	],
}
import typescript from "rollup-plugin-typescript";

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
	],
}
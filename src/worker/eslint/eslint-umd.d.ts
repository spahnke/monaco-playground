declare module "*eslint.js" {
	const Linter: typeof import("eslint").Linter;
	export { Linter };
}
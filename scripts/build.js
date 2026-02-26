import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { styleText } from "node:util"

if (process.argv.includes("clean")) {
	fs.rmSync("test/dist", { recursive: true, force: true });
	fs.rmSync("wwwroot", { recursive: true, force: true });
	process.exit();
}

const watch = process.argv.includes("watch");

for (const srcPath of fs.globSync("node_modules/monaco-editor/esm/nls.messages.*.js")) {
	const destPath = `wwwroot/lib/monaco-editor/${path.basename(srcPath)}`;
	fs.mkdirSync(path.dirname(destPath), { recursive: true });
	fs.copyFileSync(srcPath, destPath);
}

const staticFiles = ["src/index.html", "src/styles.css", ...fs.globSync("src/languages/**/*.json"), "src/worker/eslint/eslint.js"];
for (const srcPath of staticFiles) {
	const destPath = srcPath.replace(path.sep, "/").replace("src/", "wwwroot/").replace("worker/eslint/", "worker/");
	fs.mkdirSync(path.dirname(destPath), { recursive: true });
	fs.copyFileSync(srcPath, destPath);
	if (watch) {
		fs.watch(srcPath, undefined, (event, fileNameWithoutPath) => {
			if (event === "change") {
				console.error(styleText("white", `[watch] build started (change: "${srcPath}")`));
				fs.copyFileSync(srcPath, destPath);
				console.error(styleText("white", "[watch] build finished"));
			} else {
				console.warn("[watch] renames not supported");
			}
		});
	}
}

build({
	entryPoints: fs.globSync("node_modules/monaco-editor/esm/vs/**/*.worker.js"),
	bundle: true,
	format: "esm",
	minify: true,
	sourcemap: true,
	outbase: "node_modules/monaco-editor/esm/",
	outdir: "wwwroot/lib/monaco-editor",
});

build({
	entryPoints: ["monaco-esm/index.js"],
	bundle: true,
	format: "esm",
	minify: true,
	sourcemap: true,
	outdir: "wwwroot/lib/monaco-editor",
	loader: {
		".ttf": "file",
	},
});

build({
	entryPoints: ["src/app.ts"],
	bundle: true,
	format: "esm",
	sourcemap: true,
	outdir: "wwwroot",
});

build({
	entryPoints: ["src/worker/eslint/eslint-worker.ts"],
	bundle: true,
	format: "esm",
	sourcemap: true,
	outdir: "wwwroot/worker",
});

build({
	entryPoints: fs.globSync("src/rules/*.ts"),
	bundle: true,
	format: "esm",
	sourcemap: true,
	outdir: "wwwroot/rules",
});

/**
 * @param {esbuild.BuildOptions} opts
 */
async function build(opts) {
	if (watch) {
		opts.logLevel ??= "info";
		const ctx = await esbuild.context(opts);
		await ctx.watch();
	} else {
		const result = await esbuild.build(opts);
		if (result.errors.length > 0) {
			console.error(result.errors);
		}
		if (result.warnings.length > 0) {
			console.error(result.warnings);
		}
	}
}
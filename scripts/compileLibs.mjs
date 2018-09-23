#!/usr/bin/env node --experimental-modules
import fs from "fs";
import path from "path";

const libPath = process.argv[2] || "/usr/local/lib/node_modules/typescript/lib";

function main() {
	let result = "";
	for (const lib of Object.keys(libs)) {
		const content = removeReferenceTags(compileLib(lib));
		result += `export const ${lib} = ${JSON.stringify(content)}\n`;
	}
	console.log(result);
}

/**
 * @type {{[x: string]: string[]}}
 */
const libs = {
	"dom": [
		"lib.dom.d.ts",
		"lib.dom.iterable.d.ts"
	],
	"es5": ["lib.es5.d.ts"],
	"es2015": [
		"es5",
		"lib.es2015.collection.d.ts",
		"lib.es2015.core.d.ts",
		"lib.es2015.generator.d.ts",
		"lib.es2015.iterable.d.ts",
		"lib.es2015.promise.d.ts",
		"lib.es2015.proxy.d.ts",
		"lib.es2015.reflect.d.ts",
		"lib.es2015.symbol.d.ts",
		"lib.es2015.symbol.wellknown.d.ts",
	],
	"es2016": [
		"es2015",
		"lib.es2016.array.include.d.ts"
	],
	"es2017": [
		"es2016",
		"lib.es2017.intl.d.ts",
		"lib.es2017.object.d.ts",
		"lib.es2017.sharedmemory.d.ts",
		"lib.es2017.string.d.ts",
		"lib.es2017.typedarrays.d.ts",
	],
	"es2018": [
		"es2017",
		"lib.es2018.intl.d.ts",
		"lib.es2018.promise.d.ts",
		"lib.es2018.regexp.d.ts",
	],
	"esnext": [
		"es2018",
		"lib.esnext.array.d.ts",
		"lib.esnext.asynciterable.d.ts",
		"lib.esnext.intl.d.ts",
		"lib.esnext.symbol.d.ts",
	],
};

/**
 * @param {string} lib
 */
function compileLib(lib) {
	let result = "";
	for (const fileName of libs[lib]) {
		if (fileName.startsWith("lib")) {
			const content = fs.readFileSync(path.join(libPath, fileName));
			result += `${content}\n`;
		} else if (libs[fileName]) {
			result += `${compileLib(fileName)}\n`;
		}
	}
	return result;
}

/**
 * @param {string} content
 */
function removeReferenceTags(content) {
	return content.replace(/\/\/\/\s*<reference.*?\/>\s*\r?\n/g, "");
}

main();
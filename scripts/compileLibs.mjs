#!/usr/bin/env node --experimental-modules
import fs from "fs";
import path from "path";

const libPath = process.argv[2] || "/usr/local/lib/node_modules/typescript/lib";

function main() {
	const missingLibs = findMissingLibs();
	if (missingLibs.length > 0) {
		console.warn("The following new libs are missing:", missingLibs);
	}

	let result = "";
	for (const lib of Object.keys(libs)) {
		const content = compileLib(lib, false);
		const parent = libs[lib].parent ? `${libs[lib].parent} + ` : "";
		result += `export const ${lib} = ${parent}${JSON.stringify(content)}\n`;
	}
	console.log(result);
}

// function main() {
// 	console.log(compileLib("esnext", true));
// }

/**
 * @type {{[x: string]: {files: string[], parent?: string}}}
 */
const libs = {
	dom: {
		files: [
			"lib.dom.d.ts",
			"lib.dom.iterable.d.ts"
		]
	},
	es5: {
		files: [
			"lib.es5.d.ts"
		]
	},
	es2015: {
		parent: "es5",
		files: [
			"lib.es2015.collection.d.ts",
			"lib.es2015.core.d.ts",
			"lib.es2015.generator.d.ts",
			"lib.es2015.iterable.d.ts",
			"lib.es2015.promise.d.ts",
			"lib.es2015.proxy.d.ts",
			"lib.es2015.reflect.d.ts",
			"lib.es2015.symbol.d.ts",
			"lib.es2015.symbol.wellknown.d.ts",
		]
	},
	es2016: {
		parent: "es2015",
		files: [
			"lib.es2016.array.include.d.ts"
		]
	},
	es2017: {
		parent: "es2016",
		files: [
			"lib.es2017.intl.d.ts",
			"lib.es2017.object.d.ts",
			"lib.es2017.sharedmemory.d.ts",
			"lib.es2017.string.d.ts",
			"lib.es2017.typedarrays.d.ts",
		]
	},
	es2018: {
		parent: "es2017",
		files: [
			"lib.es2018.asynciterable.d.ts",
			"lib.es2018.intl.d.ts",
			"lib.es2018.promise.d.ts",
			"lib.es2018.regexp.d.ts",
		]
	},
	es2019: {
		parent: "es2018",
		files: [
			"lib.es2019.array.d.ts",
			"lib.es2019.string.d.ts",
			"lib.es2019.symbol.d.ts",
		]
	},
	esnext: {
		parent: "es2019",
		files: [
			"lib.esnext.array.d.ts",
			"lib.esnext.asynciterable.d.ts",
			"lib.esnext.bigint.d.ts",
			"lib.esnext.intl.d.ts",
			"lib.esnext.symbol.d.ts",
		]
	},
};

function findMissingLibs() {
	const libNames = Object.keys(libs).flatMap(lib => libs[lib].files);
	const availableLibs = fs.readdirSync(libPath)
		.filter(lib => /^lib\..+\.d\.ts$/.test(lib))
		.filter(lib => !/\.full\.|scripthost|webworker|^lib\.es\w+?\.d\.ts$/.test(lib));
	return availableLibs.filter(x => !libNames.includes(x));
}

/**
 * @param {string} lib
 * @param {boolean} complete
 */
function compileLib(lib, complete) {
	let result = "";
	if (complete && libs[lib].parent)
		result += `${compileLib(libs[lib].parent, complete)}\n`;
	for (const fileName of libs[lib].files) {
		const content = fs.readFileSync(path.join(libPath, fileName)).toString();
		result += `${removeReferenceTags(content)}\n`;
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

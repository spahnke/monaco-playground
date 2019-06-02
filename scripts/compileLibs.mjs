#!/usr/bin/env node --experimental-modules
import fs from "fs";
import path from "path";

const options = parseCommandLine({
	libPath: { type: String, defaultValue: "/usr/local/lib/node_modules/typescript/lib" },
	target: { type: String, defaultValue: "esnext" },
	complete: { type: Boolean, defaultValue: false },
	verbose: { type: Boolean, defaultValue: false },
});

function main() {
	const libs = findLibs();

	if (options.complete) {
		output(compileLib(libs, options.target, /*complete*/ true));
	} else {
		let result = "";
		for (const lib of Object.keys(libs)) {
			const content = compileLib(libs, lib, /*complete*/ false);
			const parent = libs[lib].parent ? `${libs[lib].parent} + ` : "";
			result += `export const ${lib} = ${parent}${JSON.stringify(content)}\n`;
		}
		output(result);
	}
}

/**
 * @typedef {{ type: BooleanConstructor | StringConstructor, defaultValue: boolean | string }} Option
 * @param {{[x: string]: Option}} definitions
 */
function parseCommandLine(definitions) {
	const options = {};
	for (let def in definitions) {
		const { type, defaultValue } = definitions[def];
		const regex = new RegExp(`--${def}`, "i");
		const index = process.argv.findIndex(x => regex.test(x));

		if (type === Boolean)
			options[def] = index !== -1 ? true : defaultValue;
		else if (type === String)
			options[def] = index !== -1 ? process.argv[index + 1] : defaultValue;
	}
	return options;
}

function findLibs() {
	const availableFiles = fs.readdirSync(options.libPath)
		.filter(lib => /^lib\..+\.d\.ts$/.test(lib))
		.filter(lib => !/\.full\.|scripthost|webworker|^lib\.es\w+?\.d\.ts$/.test(lib))
		.sort();
	log("Found the following files:", availableFiles);

	/**
	 * @type {{[x: string]: {files: string[], parent?: string}}}
	 */
	const libs = {
		es5: {
			files: [
				"lib.es5.d.ts"
			]
		}
	};
	let lastLib = "";
	for (const fileName of availableFiles) {
		const libName = /^lib\.(?<libName>\w+)\./.exec(fileName).groups["libName"];
		if (libName in libs) {
			libs[libName].files.push(fileName);
		} else {
			libs[libName] = { files: [fileName] };
			const parent = getParentLib(libName, lastLib);
			if (parent)
				libs[libName].parent = parent;
			lastLib = libName;
		}
	}
	log("Compiled libs:", libs);
	return libs;
}

/**
 * @param {string} libName
 * @param {string} lastLib
 */
function getParentLib(libName, lastLib) {
	const standardMatch = /^es(?<standard>.+)$/.exec(libName);
	if (!standardMatch) {
		return undefined;
	}
	const standard = standardMatch.groups["standard"];
	if (standard === "next") {
		return lastLib;
	}
	const standardsYear = Number.parseInt(standard);
	return standardsYear === 2015 ? "es5" : `es${standardsYear - 1}`;
}

/**
 * @param {{[x: string]: {files: string[], parent?: string}}} libs
 * @param {string} lib
 * @param {boolean} complete
 */
function compileLib(libs, lib, complete) {
	let result = "";
	if (complete && libs[lib].parent)
		result += `${compileLib(libs, libs[lib].parent, complete)}\n`;
	for (const fileName of libs[lib].files) {
		const content = fs.readFileSync(path.join(options.libPath, fileName)).toString();
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

function log(message, ...optionalParams) {
	if (options.verbose)
		console.warn(message, ...optionalParams);
}

/**
 * @param {string} text
 */
function output(text) {
	console.log(text);
}

main();

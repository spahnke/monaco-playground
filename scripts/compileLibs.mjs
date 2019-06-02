#!/usr/bin/env node --experimental-modules
import fs from "fs";
import path from "path";

/**
 * @typedef {{files: string[], parent?: string}} Lib
 * @typedef {{[x: string]: Lib}} LibMap
 * @typedef {{ type: BooleanConstructor | StringConstructor, defaultValue: boolean | string }} Option
 * @typedef {{[x: string]: Option}} OptionDefinition
 */

const options = parseCommandLine({
	libPath: { type: String, defaultValue: "/usr/local/lib/node_modules/typescript/lib" },
	target: { type: String, defaultValue: "esnext" },
	complete: { type: Boolean, defaultValue: false },
	verbose: { type: Boolean, defaultValue: false },
});

function main() {
	const libs = getLibs();

	if (options.complete) {
		writeOutput(compileLib(libs, options.target, /*complete*/ true));
	} else {
		let result = "";
		for (const lib of Object.keys(libs)) {
			const content = compileLib(libs, lib, /*complete*/ false);
			const parent = libs[lib].parent ? `${libs[lib].parent} + ` : "";
			result += `export const ${lib} = ${parent}${JSON.stringify(content)}\n`;
		}
		writeOutput(result);
	}
}

/**
 * @param {OptionDefinition} definitions
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

function getLibs() {
	/**
	 * @type LibMap
	 */
	const libs = {
		es5: { files: ["lib.es5.d.ts"] }
	};
	let lastLib = "";
	for (const fileName of getFilesSortedByFilename()) {
		const libName = /^lib\.(?<libName>\w+)\./.exec(fileName).groups["libName"];
		if (libName in libs) {
			libs[libName].files.push(fileName);
		} else {
			libs[libName] = { files: [fileName] };
			libs[libName].parent = getParentLib(libName, lastLib);;
			lastLib = libName;
		}
	}
	writeLog("Lib map:", libs);
	return libs;
}

function getFilesSortedByFilename() {
	const files = fs.readdirSync(options.libPath)
		.filter(lib => /^lib\..+\.d\.ts$/.test(lib))
		.filter(lib => !/\.full\.|scripthost|webworker|^lib\.es\w+?\.d\.ts$/.test(lib))
		.sort();
	writeLog("Found the following files:", files);
	return files;
}

/**
 * @param {string} libName
 * @param {string} lastLib
 */
function getParentLib(libName, lastLib) {
	if (!libName.startsWith("es"))
		return undefined;
	if (libName === "es2015")
		return "es5";
	return lastLib;
}

/**
 * @param {LibMap} libs
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

/**
 * @param {any} message
 * @param {any[]} optionalParams
 */
function writeLog(message, ...optionalParams) {
	if (options.verbose)
		console.warn(message, ...optionalParams);
}

/**
 * @param {string} text
 */
function writeOutput(text) {
	console.log(text);
}

main();

import { writeFile } from "fs/promises";
import https from "https";

try {
	const schemaText = await getText("https://json.schemastore.org/eslintrc.json");
	/** @type {EslintSchema} */
	const schema = JSON.parse(schemaText);

	schema.title = `Extended ${schema.title}`;
	schema.definitions.rule.oneOf[1].description += "\"hint\" - turn the rule on as a hint (is not affected by the global auto-fix)\n\"info\" - turn the rule on as a information"
	schema.definitions.rule.oneOf[1].enum.push("hint", "info");
	schema.properties.ruleFiles = {
		description: "Optional paths to additional rule files, either absolute webserver paths, or relative to the worker directory.\n- The filename without the extension is the rule ID\n- The rule must be compiled as a standalone AMD module\n- The rule object must be the default export of the module",
		type: "array",
		items: {
			"type": "string"
		}
	};

	const newSchemaText = JSON.stringify(schema, undefined, "\t");
	await writeFile("src/languages/javascript/eslintrc-extended.schema.json", newSchemaText, "utf8");
} catch (e) {
	console.error(e);
}

/**
 * Performs a GET request to `url` and return a Promise resolving to the body text.
 * @param {string} url
 * @returns {Promise<string>}
 */
function getText(url) {
	return new Promise((resolve, reject) => {
		https.get(url, res => {
			const { statusCode } = res;

			if (statusCode !== 200) {
				// Consume response data to free up memory
				res.resume();
				throw new Error("Request Failed.\n" + `Status Code: ${statusCode}`);
			}

			res.setEncoding("utf8");
			let text = "";
			res.on("data", chunk => text += chunk);
			res.on("end", () => resolve(text));
		}).on("error", reject);
	});
}

/**
 * @typedef {{
		title: string;
		definitions: {
			rule: {
				oneOf: {
					"1": {
						description: string;
						enum: string[];
					};
				};
			};
		};
		properties: {
			ruleFiles?: any;
		};
	}} EslintSchema
 */
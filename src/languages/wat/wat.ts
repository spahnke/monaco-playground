const languageConfig: monaco.languages.LanguageConfiguration = {
	comments: {
		lineComment: ";;",
		blockComment: ["(;", ";)"],
	},

	brackets: [
		["(", ")"],
		["[", "]"],
	],

	autoClosingPairs: [
		{ open: "(", close: ")" },
		{ open: "[", close: "]" },
		{ open: "\"", close: "\"", notIn: ["string", "comment"] },
	],

	surroundingPairs: [
		{ open: "(", close: ")" },
		{ open: "\"", close: "\"" },
	],
};

const monarchTokenProvider: monaco.languages.IMonarchLanguage = {

	keywords: [
		"data",
		"elem", "export",
		"func",
		"global",
		"import",
		"local",
		"memory", "module",
		"param",
		"result",
		"table",
	],

	typeKeywords: [
		"i32", "i64",
		"f32", "f64",
		"v128",
		"funcref",
		"exnref",
		"externref",
	],

	operators: [
		"=", "::", "..", ".", "-",
	],

	symbols: /[=:+-.]+/,

	tokenizer: {
		root: [
			// identifiers and keywords
			[/[a-z_$][\w$]*/, {
				cases: {
					"@typeKeywords": "keyword",
					"@keywords": "keyword",
					"@default": "identifier"
				}
			}],

			// whitespace
			{ include: "@whitespace" },

			// delimiters and operators
			[/[()[\]]/, "@brackets"],
			[/@symbols/, {
				cases: {
					"@operators": "operator",
					"@default": ""
				}
			}],

			// numbers
			[/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
			[/0[xX][0-9a-fA-F]+/, "number.hex"],
			[/\d+/, "number"],

			// delimiter: after number because of .\d floats
			[/[;,.]/, "delimiter"],

			// strings
			[/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
		],

		comment: [
			[/[^(;)]+/, "comment"],
			[/;\)/, "comment", "@pop"],
			[/[(;)]/, "comment"]
		],

		string: [
			[/[^"]+/, "string"],
			[/"/, { token: "string.quote", bracket: "@close", next: "@pop" }]
		],

		whitespace: [
			[/[ \t\r\n]+/, "white"],
			[/\(;/, "comment", "@comment"],
			[/;;.*$/, "comment"],
		],
	},
};

export function registerWat(): void {
	const languageId = "wat";
	monaco.languages.register({
		id: languageId,
		extensions: [".wat"],
		aliases: ["WebAssembly Text", "WAT", "wat"],
	});
	monaco.languages.onLanguage(languageId, () => {
		monaco.languages.setLanguageConfiguration(languageId, languageConfig);
		monaco.languages.setMonarchTokensProvider(languageId, monarchTokenProvider);
	});
}
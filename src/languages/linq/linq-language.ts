export const languageId = "linq";

export const languageConfig: monaco.languages.LanguageConfiguration = {
	comments: {
		lineComment: "//",
		blockComment: ["/*", "*/"],
	},

	brackets: [
		["{", "}"],
		["[", "]"],
		["(", ")"],
	],

	autoClosingPairs: [
		{ open: "{", close: "}" },
		{ open: "[", close: "]" },
		{ open: "(", close: ")" },
		{ open: "'", close: "'", notIn: ["string", "comment"] },
		{ open: "\"", close: "\"", notIn: ["string", "comment"] },
	],

	surroundingPairs: [
		{ open: "{", close: "}" },
		{ open: "[", close: "]" },
		{ open: "(", close: ")" },
		{ open: "<", close: ">" },
		{ open: "'", close: "'" },
		{ open: "\"", close: "\"" },
	],
};

export const monarchTokenProvider: TokenProvider = {

	keywords: [
		"as", "ascending",
		"by",
		"descending",
		"equals",
		"false",
		"from",
		"group",
		"into", "in", "is",
		"join",
		"let",
		"new", "null",
		"on", "orderby",
		"select",
		"true",
		"where",
	],

	typeKeywords: [
		"bool", "byte",
		"char",
		"decimal",
		"double",
		"float",
		"int",
		"long",
		"object",
		"short",
		"string",
		"void",
	],

	operators: [
		"=", ">", "<", "!", "~", "?", ":", "==", "===", "<=", ">=", "!=", "!==",
		"&&", "||", "++", "--", "+", "-", "*", "/", "&", "|", "^", "%",
		"<<", ">>", "+=", "-=", "*=", "/=", "&=", "|=", "^=",
		"%=", "<<=", ">>="
	],

	// we include these common regular expressions
	symbols: /[=><!~?:&|+\-*\/\^%]+/,

	// C# style strings
	escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

	// The main tokenizer for our languages
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
			[/[A-Z][\w\$]*/, "type.identifier"],  // to show class names nicely

			// whitespace
			{ include: "@whitespace" },

			// delimiters and operators
			[/[{}()\[\]]/, "@brackets"],
			[/[<>](?!@symbols)/, "@brackets"],
			[/@symbols/, {
				cases: {
					"@operators": "operator",
					"@default": ""
				}
			}],

			// @ table names
			[/@[A-Z]\w*/, "type.identifier"],

			// numbers
			[/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
			[/0[xX][0-9a-fA-F]+/, "number.hex"],
			[/\d+/, "number"],

			// delimiter: after number because of .\d floats
			[/[;,.]/, "delimiter"],

			// strings
			[/"([^"\\]|\\.)*$/, "string.invalid"],  // non-teminated string
			[/"/, { token: "string.quote", bracket: "@open", next: "@string" }],

			// characters
			[/'[^\\']'/, "string"],
			[/(')(@escapes)(')/, <any>["string", "string.escape", "string"]],
			[/'/, "string.invalid"]
		],

		comment: [
			[/[^\/*]+/, "comment"],
			[/\/\*/, "comment", "@push"],    // nested comment
			[/\*\//, "comment", "@pop"],
			[/[\/*]/, "comment"]
		],

		string: [
			[/[^\\"]+/, "string"],
			[/@escapes/, "string.escape"],
			[/\\./, "string.escape.invalid"],
			[/"/, { token: "string.quote", bracket: "@close", next: "@pop" }]
		],

		whitespace: [
			[/[ \t\r\n]+/, "white"],
			[/\/\*/, "comment", "@comment"],
			[/\/\/.*$/, "comment"],
		],
	},
};

interface TokenProvider extends monaco.languages.IMonarchLanguage {
	escapes: RegExp;
	keywords: string[];
	operators: string[];
	symbols: RegExp;
	typeKeywords: string[];
}
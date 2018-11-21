export class LinqLanguageProvider {
	private static readonly languageId = "linq";

	static register() {
		if (!monaco.languages.getLanguages().some(x => x.id === "linq")) {
			monaco.languages.register({ id: LinqLanguageProvider.languageId });
			monaco.languages.setLanguageConfiguration(LinqLanguageProvider.languageId, languageConfig);
			monaco.languages.setMonarchTokensProvider(LinqLanguageProvider.languageId, monarchTokenProvider);
			monaco.languages.registerCompletionItemProvider(LinqLanguageProvider.languageId, this.createCompletionProvider());
			monaco.languages.registerDocumentFormattingEditProvider(LinqLanguageProvider.languageId, this.createFormatProvider());
		}
	}

	private static createCompletionProvider(): monaco.languages.CompletionItemProvider {
		return {
			provideCompletionItems: (model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.languages.CompletionContext, token: monaco.CancellationToken) => {
				if (model.getValue() === "" && position.lineNumber === 1 && position.column === 1) {
					return { suggestions: this.getSnippets() };
				}

				if (this.shouldCompleteTables(model, position, token, context)) {
					return { suggestions: this.getTables() };
				}

				return { suggestions: this.getKeywords() };
			},
			triggerCharacters: ["@"]
		};
	}

	private static createFormatProvider(): monaco.languages.DocumentFormattingEditProvider {
		return {
			provideDocumentFormattingEdits: (model: monaco.editor.ITextModel, options: monaco.languages.FormattingOptions, token: monaco.CancellationToken) => {
				return [
					<monaco.languages.TextEdit>{
						range: model.getFullModelRange(),
						text: this.formatLinqExpression(model.getValue())
					}
				];
			}
		};
	}

	private static getSnippets(): monaco.languages.CompletionItem[] {
		return [
			{
				label: "query",
				kind: monaco.languages.CompletionItemKind.Snippet,
				insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
				insertText: `
from x in @\$1
\$0
select x`.trim(),
				documentation: {
					value: "A basic LINQ query"
				},
				sortText: "_query",
			},
		];
	}

	private static shouldCompleteTables(document: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken, context: monaco.languages.CompletionContext): boolean {
		if (context.triggerCharacter === "@") {
			return true;
		}

		if (position.column > 1) {
			let startIndex = position.column - 1;
			const currentWord = document.getWordAtPosition(position);
			if (currentWord && currentWord.startColumn > 1) {
				startIndex = currentWord.startColumn - 1;
			}
			const lineContent = document.getLineContent(position.lineNumber);
			return lineContent[startIndex - 1] === "@";
		}

		return false;
	}

	private static getTables(): monaco.languages.CompletionItem[] {
		return [
			{
				label: "User",
				kind: monaco.languages.CompletionItemKind.Class,
				insertText: "User"
			},
		];
	}

	private static getKeywords(): monaco.languages.CompletionItem[] {
		return monarchTokenProvider.keywords.map(x => (<monaco.languages.CompletionItem>{
			label: x,
			kind: monaco.languages.CompletionItemKind.Keyword,
		}));
	}

	private static formatLinqExpression(expression: string): string {
		expression = this.removeLineBreaksAndExtraWhitespace(expression);
		expression = this.insertLineBreaks(expression);
		return expression;
	}

	private static removeLineBreaksAndExtraWhitespace(expression: string): string {
		return expression.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\t/g, ' ').replace(/\s{2,}/g, ' ');
	}

	private static insertLineBreaks(expression: string): string {
		expression = this.replaceIfNotInString(expression, ` from `, '\nfrom ');
		expression = this.replaceIfNotInString(expression, ` where `, '\nwhere ');
		expression = this.replaceIfNotInString(expression, ` select `, '\nselect ');
		expression = this.replaceIfNotInString(expression, ` group `, '\ngroup ');
		expression = this.replaceIfNotInString(expression, ` orderby `, '\norderby ');
		expression = this.replaceIfNotInString(expression, ` join `, '\njoin ');
		expression = this.replaceIfNotInString(expression, ` let `, '\nlet ');
		expression = this.replaceIfNotInString(expression, `&&`, '\n\t&& ');
		expression = this.replaceIfNotInString(expression, `\\|\\|`, '\n\t|| ');
		expression = this.replaceIfNotInString(expression, ` *{ *`, ' {\n\t');
		expression = this.replaceIfNotInString(expression, ` *} *`, '\n}');
		expression = this.replaceIfNotInString(expression, ` *, *`, ",\n\t");
		return this.replaceIfNotInString(expression, ` {2,}`, ' ');
	}

	private static replaceIfNotInString(expression: string, pattern: string, replacement: string): string {
		// see http://www.rexegg.com/regex-best-trick.html
		const regex = new RegExp(`"[^"]*?"|'[^']*?'|(${pattern})`, "g");
		return expression.replace(regex, (match: string, group1: string) => group1 ? replacement : match);
	}
}

const languageConfig = <monaco.languages.LanguageConfiguration>{
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

const monarchTokenProvider = <TokenProvider>{
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
		"boolean", "byte",
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
	keywords: string[];
}

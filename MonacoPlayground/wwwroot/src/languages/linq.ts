export class LinqLanguageProvider {
	private static readonly languageId = "linq";

	install() {
		monaco.languages.register({ id: LinqLanguageProvider.languageId });
		monaco.languages.setMonarchTokensProvider(LinqLanguageProvider.languageId, monarchTokenProvider);
		monaco.languages.registerCompletionItemProvider(LinqLanguageProvider.languageId, this.createCompletionProvider());
	}

	private createCompletionProvider(): monaco.languages.CompletionItemProvider {
		return {
			provideCompletionItems: (document: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken, context: monaco.languages.CompletionContext) => {
				if (document.getValue() === "" && position.lineNumber === 1 && position.column === 1) {
					return this.getSnippets();
				}

				if (this.shouldCompleteTables(document, position, token, context)) {
					return this.getTables();
				}

				return this.getKeywords();
			},
			triggerCharacters: ["@"]
		};
	}

	private getSnippets(): monaco.languages.CompletionItem[] {
		return [
			{
				label: "query",
				kind: monaco.languages.CompletionItemKind.Snippet,
				insertText: {
					value: `
from x in @\$1
\$0
select x`.trim()
				},
				documentation: {
					value: "A basic LINQ query"
				},
				sortText: "_query",
			},
		];
	}

	private shouldCompleteTables(document: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken, context: monaco.languages.CompletionContext): boolean {
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

	private getTables(): monaco.languages.CompletionItem[] {
		return [
			{
				label: "User",
				kind: monaco.languages.CompletionItemKind.Class,
			},
		];
	}

	private getKeywords(): monaco.languages.CompletionItem[] {
		return monarchTokenProvider.keywords.map(x => (<monaco.languages.CompletionItem>{
			label: x,
			kind: monaco.languages.CompletionItemKind.Keyword,
		}));
	}
}

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

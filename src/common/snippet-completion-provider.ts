/*---------------------------------------------------------------------------------------------
 *  Adopted partly from https://github.com/microsoft/vscode/blob/master/src/vs/workbench/contrib/snippets/browser/snippetCompletionProvider.ts
 *--------------------------------------------------------------------------------------------*/

export class Snippet {
	readonly body: string;
	readonly prefixLow: string;

	constructor(
		readonly name: string,
		readonly prefix: string,
		body: string | string[],
		readonly description: string,
		readonly label: string = prefix,
		readonly filterText: string = prefix,
		readonly sortText: string = prefix
	) {
		this.body = Array.isArray(body) ? body.join("\n") : body;
		this.prefixLow = prefix?.toLowerCase();
	}

	get documentation(): monaco.IMarkdownString {
		// Replace variable placeholders by
		// $0, $1 -> empty string
		// ${1:text} -> text
		const variablePattern = /\$\d+|\${\d+:(\w+)\}/gi;
		const code = this.body.replace(variablePattern, "$1");
		return {
			isTrusted: false,
			value: "```\n" + code + "\n```"
		};
	}
}

export interface ISnippetService {
	getSnippets(): Promise<Snippet[]>;
}

class SnippetCompletion implements monaco.languages.CompletionItem {

	label: string;
	detail: string;
	insertText: string;
	documentation?: monaco.IMarkdownString;
	range: monaco.IRange;
	filterText: string;
	sortText: string;
	kind = monaco.languages.CompletionItemKind.Snippet;
	insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

	constructor(readonly snippet: Snippet, range: monaco.IRange) {
		this.label = snippet.label;
		this.detail = snippet.description;
		this.insertText = snippet.body;
		this.range = range;
		this.filterText = snippet.filterText;
		this.sortText = snippet.sortText;
	}

	resolve(): this {
		this.documentation = this.snippet.documentation;
		return this;
	}
}

export class SnippetCompletionProvider implements monaco.languages.CompletionItemProvider {
	constructor(private readonly snippetService: ISnippetService) {
	}

	async provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.languages.CompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.CompletionList | undefined> {
		if (context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter && context.triggerCharacter === " ") {
			// no snippets when suggestions have been triggered by space
			return undefined;
		}

		const snippets = await this.snippetService.getSnippets();

		const pos = { lineNumber: position.lineNumber, column: 1 };
		const lineOffsets: number[] = [];
		const linePrefixLow = model.getLineContent(position.lineNumber).substr(0, position.column - 1).toLowerCase();
		const endsInWhitespace = linePrefixLow.match(/\s$/);

		while (pos.column < position.column) {
			const word = model.getWordAtPosition(pos);
			if (word) {
				// at a word
				lineOffsets.push(word.startColumn - 1);
				pos.column = word.endColumn + 1;
				if (word.endColumn - 1 < linePrefixLow.length && !/\s/.test(linePrefixLow[word.endColumn - 1]))
					lineOffsets.push(word.endColumn - 1);
			}
			else if (!/\s/.test(linePrefixLow[pos.column - 1])) {
				// at a none-whitespace character
				lineOffsets.push(pos.column - 1);
				pos.column += 1;
			}
			else {
				// always advance!
				pos.column += 1;
			}
		}

		const availableSnippets = new Set<Snippet>();
		snippets.forEach(availableSnippets.add, availableSnippets);
		const suggestions: monaco.languages.CompletionItem[] = [];
		for (const start of lineOffsets) {
			availableSnippets.forEach(snippet => {
				if (this.isPatternInWord(linePrefixLow, start, linePrefixLow.length, snippet.prefixLow, 0, snippet.prefixLow.length)) {
					suggestions.push(new SnippetCompletion(snippet, monaco.Range.fromPositions(position.delta(0, -(linePrefixLow.length - start)), position)));
					availableSnippets.delete(snippet);
				}
			});
		}
		if (endsInWhitespace || lineOffsets.length === 0) {
			// add remaing snippets when the current prefix ends in whitespace or when no
			// interesting positions have been found
			availableSnippets.forEach(snippet => {
				suggestions.push(new SnippetCompletion(snippet, monaco.Range.fromPositions(position)));
			});
		}

		return { suggestions };
	}

	resolveCompletionItem(item: monaco.languages.CompletionItem, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.CompletionItem> {
		return (item instanceof SnippetCompletion) ? item.resolve() : item;
	}

	private isPatternInWord(patternLow: string, patternPos: number, patternLen: number, wordLow: string, wordPos: number, wordLen: number): boolean {
		while (patternPos < patternLen && wordPos < wordLen) {
			if (patternLow[patternPos] === wordLow[wordPos])
				patternPos += 1;
			wordPos += 1;
		}
		return patternPos === patternLen; // pattern must be exhausted
	}
}
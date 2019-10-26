import { monarchTokenProvider } from "./linq-language.js";

interface LinqInformation {
	tableOrViewName: string;
	isTable: boolean;
}

export function isTableOrViewIdentifier(document: monaco.editor.ITextModel, position: monaco.Position, context ?: monaco.languages.CompletionContext): boolean {
	if (context && context.triggerCharacter === "@") {
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

export class LinqCompletionProvider implements monaco.languages.CompletionItemProvider {
	private static linqInformation: LinqInformation[] | null = null;

	public static async getDocumentationByName(tableOrViewName: string): Promise<monaco.IMarkdownString | undefined> {
		const linqInformation = await LinqCompletionProvider.getLinqInformation();
		const linqInfo = linqInformation.find(x => x.tableOrViewName === tableOrViewName);
		if (!linqInfo)
			return undefined;
		return getTableOrViewDocumentation(linqInfo);
	}

	public static async getLinqInformation(): Promise<LinqInformation[]> {
		if (LinqCompletionProvider.linqInformation === null) {
			LinqCompletionProvider.linqInformation = [{ tableOrViewName: "User", isTable: true }, { tableOrViewName: "AccountView", isTable: false }];
		}
		return LinqCompletionProvider.linqInformation;
	}

	triggerCharacters = ["@"];

	async provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.languages.CompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.CompletionList> {
		const word = model.getWordUntilPosition(position);
		const range: monaco.IRange = {
			startLineNumber: position.lineNumber,
			endLineNumber: position.lineNumber,
			startColumn: word.startColumn,
			endColumn: word.endColumn
		};

		if (isTableOrViewIdentifier(model, position, context)) {
			return this.getTablesAndViews(range);
		}

		return Promise.resolve(this.getKeywords(range));
	}

	private async getTablesAndViews(range: monaco.IRange): Promise<monaco.languages.CompletionList> {
		const linqInformation = await LinqCompletionProvider.getLinqInformation();
		const suggestions = linqInformation.map(x => {
			const result: monaco.languages.CompletionItem = {
				label: x.tableOrViewName,
				kind: x.isTable ? monaco.languages.CompletionItemKind.Class : monaco.languages.CompletionItemKind.Interface,
				insertText: x.tableOrViewName,
				range,
				documentation: getTableOrViewDocumentation(x),
			}
			return result;
		});
		return { suggestions };
	}

	private getKeywords(range: monaco.IRange): monaco.languages.CompletionList {
		const suggestions = monarchTokenProvider.keywords.map(x => {
			const result: monaco.languages.CompletionItem = {
				label: x,
				kind: monaco.languages.CompletionItemKind.Keyword,
				insertText: x,
				range,
			}
			return result;
		});
		return { suggestions };
	}
}

function getTableOrViewDocumentation(linqInformation: LinqInformation): monaco.IMarkdownString {
	const anonymousTypeNeededDocumentation = `Cannot be used directly. Use an anonymous type instead.

**Example:**
\`\`\`
select new {
	x.myProperty,
	renamed = x.myOtherProperty,
	...
}
\`\`\``;
	return {
		value: linqInformation.isTable ? "Can be used directly." : anonymousTypeNeededDocumentation,
		isTrusted: false
	};
}
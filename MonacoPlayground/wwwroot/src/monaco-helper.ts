export interface ILibrary {
	contents: string;
	language: string;
	filePath: string;
}

export interface ITemplate {
	prefix: string;
	name: string;
	description: string;
	templateText: string;
}

export function addLibrary(library: ILibrary): monaco.IDisposable[] {
	const disposables: monaco.IDisposable[] = [];

	const uri = monaco.Uri.file(library.filePath);
	// TODO should make peek/goto definition work but leads to an error
	if (library.filePath.endsWith("d.ts"))
		disposables.push(monaco.languages.typescript.javascriptDefaults.addExtraLib(library.contents, uri.toString()));
	disposables.push(monaco.editor.createModel(library.contents, library.language, uri));

	return disposables;
}

export function addTemplates(language: string, templates: ITemplate[]): monaco.IDisposable {
	return monaco.languages.registerCompletionItemProvider(language, {
		provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.languages.CompletionContext, token: monaco.CancellationToken) {
			const word = model.getWordUntilPosition(position);
			const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
			return {
				suggestions: templates.map(x => asCompletionItem(x, range))
			};
		}
	});
}

function asCompletionItem(template: ITemplate, range: monaco.Range): monaco.languages.CompletionItem {
	return {
		label: template.name,
		filterText: template.prefix,
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		detail: template.description,
		insertText: template.templateText,
		range,
	};
}
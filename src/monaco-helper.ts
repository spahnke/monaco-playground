import { SnippetCompletionProvider, ISnippetService, Snippet } from "./languages/snippet-completion-provider.js";

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
	sortText?: string;
}

export function addLibrary(library: ILibrary): monaco.IDisposable[] {
	const disposables: monaco.IDisposable[] = [];

	const uri = monaco.Uri.file(library.filePath);
	if (library.filePath.endsWith("d.ts")) {
		disposables.push(monaco.languages.typescript.javascriptDefaults.addExtraLib(library.contents, uri.toString()));
		disposables.push(monaco.languages.typescript.typescriptDefaults.addExtraLib(library.contents, uri.toString()));
	}
	const model = monaco.editor.getModel(uri);
	if (!model)
		disposables.push(monaco.editor.createModel(library.contents, library.language, uri));
	else
		model.setValue(library.contents);

	return disposables;
}

export function addTemplates(language: string, templates: ITemplate[]): monaco.IDisposable {
	return monaco.languages.registerCompletionItemProvider(language, new SnippetCompletionProvider(new InMemorySnippetService(templates)));
}

class InMemorySnippetService implements ISnippetService {
	constructor(private readonly orionTemplates: ITemplate[]) {
	}

	async getSnippets(): Promise<Snippet[]> {
		return this.orionTemplates.map(this.asSnippet);
	}

	private asSnippet(template: ITemplate): Snippet {
		return new Snippet(template.name, template.prefix, template.templateText, template.description, template.name, template.prefix, template.sortText);
	}
}
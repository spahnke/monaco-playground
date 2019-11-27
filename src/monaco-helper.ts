import { registerLanguages } from "./languages/language-registry.js";
import { ISnippetService, Snippet, SnippetCompletionProvider } from "./languages/snippet-completion-provider.js";

export class MonacoHelper {
	private static editorLoaded: Promise<void> | null = null;

	static loadEditor(): Promise<void> {
		if (MonacoHelper.editorLoaded === null) {
			MonacoHelper.editorLoaded = new Promise<void>(resolve => {
				window.require.config({ paths: { vs: "lib/monaco/dev/vs" } });
				// window.require.config({
				// 	"vs/nls": {
				// 		availableLanguages: {
				// 			"*": "de"
				// 		}
				// 	}
				// });
				window.require(["vs/editor/editor.main"], async () => {
					registerLanguages();
					resolve();
				});
			});
		}
		return MonacoHelper.editorLoaded;
	}

	static async colorizeElement(element: HTMLElement): Promise<void> {
		await MonacoHelper.loadEditor();
		await monaco.editor.colorizeElement(element, {});
	}

	/**
	 * CAUTION: Uses an internal API to get an object of the non-exported class ContextKeyExpr.
	 */
	static get ContextKeyExpr(): Promise<monaco.platform.IContextKeyExprFactory> {
		return new Promise(resolve => {
			window.require(["vs/platform/contextkey/common/contextkey"], (x: { ContextKeyExpr: monaco.platform.IContextKeyExprFactory }) => {
				resolve(x.ContextKeyExpr);
			});
		});
	}

	/**
	 * CAUTION: Uses an internal API to get an instance of the non-exported class EditorZoom as `editor.getConfiguration().fontInfo.zoomLevel` always returns the initial zoom level.
	 */
	static get editorZoom(): Promise<monaco.editor.IEditorZoom> {
		return new Promise(resolve => {
			window.require(["vs/editor/common/config/editorZoom"], (x: { EditorZoom: monaco.editor.IEditorZoom }) => {
				resolve(x.EditorZoom);
			});
		});
	}
}

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
	let model = monaco.editor.getModel(uri);
	if (!model) {
		model = monaco.editor.createModel(library.contents, library.language, uri);
		disposables.push(model);
	} else {
		model.setValue(library.contents);
	}

	if (library.filePath.endsWith("d.ts")) {
		const content = model.getValue(); // use value of model to make line endings and whitespace consistent between monaco and TypeScript
		disposables.push(monaco.languages.typescript.javascriptDefaults.addExtraLib(content, uri.toString()));
		disposables.push(monaco.languages.typescript.typescriptDefaults.addExtraLib(content, uri.toString()));
	}

	return disposables;
}

export function addTemplates(language: string, templates: ITemplate[]): monaco.IDisposable {
	return monaco.languages.registerCompletionItemProvider(language, new SnippetCompletionProvider(new InMemorySnippetService(templates)));
}

class InMemorySnippetService implements ISnippetService {
	constructor(private readonly templates: ITemplate[]) {
	}

	async getSnippets(): Promise<Snippet[]> {
		return this.templates.map(this.asSnippet);
	}

	private asSnippet(template: ITemplate): Snippet {
		return new Snippet(template.name, template.prefix, template.templateText, template.description, template.name, template.prefix, template.sortText);
	}
}
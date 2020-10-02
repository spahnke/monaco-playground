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
		return monaco.editor.colorizeElement(element, {});
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

	/**
	 * CAUTION: Uses an internal API to get a list of all keybindings sorted by command/action name.
	 */
	static getKeybindings(editor: monaco.editor.IStandaloneCodeEditor) {
		type Keybinding = { command: string; keybinding?: string, when?: string };

		const keybindings = editor._standaloneKeybindingService._getResolver()._keybindings.map(x => (<Keybinding>{
			command: x.command,
			keybinding: x.resolvedKeybinding.getAriaLabel(),
			when: x.when?.serialize()
		}));

		// add actions without default keybinding
		for (const action of Object.values(editor._actions)) {
			if (keybindings.some(x => x.command === action.id))
				continue;
			keybindings.push({
				command: action.id,
				when: action._precondition?.serialize()
			});
		}

		return keybindings.sort((a, z) => a.command.localeCompare(z.command));
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

export function usuallyProducesCharacter(keyCode: monaco.KeyCode): boolean {
	if (keyCode >= monaco.KeyCode.KEY_0 && keyCode <= monaco.KeyCode.KEY_9) {
		return true;
	}
	if (keyCode >= monaco.KeyCode.NUMPAD_0 && keyCode <= monaco.KeyCode.NUMPAD_9) {
		return true;
	}
	if (keyCode >= monaco.KeyCode.KEY_A && keyCode <= monaco.KeyCode.KEY_Z) {
		return true;
	}
	switch (keyCode) {
		// case monaco.KeyCode.Tab:
		case monaco.KeyCode.Enter:
		case monaco.KeyCode.Space:
		case monaco.KeyCode.Delete:
		case monaco.KeyCode.US_SEMICOLON:
		case monaco.KeyCode.US_EQUAL:
		case monaco.KeyCode.US_COMMA:
		case monaco.KeyCode.US_MINUS:
		case monaco.KeyCode.US_DOT:
		case monaco.KeyCode.US_SLASH:
		case monaco.KeyCode.US_BACKTICK:
		case monaco.KeyCode.US_OPEN_SQUARE_BRACKET:
		case monaco.KeyCode.US_BACKSLASH:
		case monaco.KeyCode.US_CLOSE_SQUARE_BRACKET:
		case monaco.KeyCode.US_QUOTE:
		case monaco.KeyCode.OEM_8:
		case monaco.KeyCode.OEM_102:
			return true;
	}
	return false;
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
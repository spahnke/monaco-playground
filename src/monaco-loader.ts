import { toDisposable } from "./common/disposable.js";
import { patchKeybindings, registerPromiseCanceledErrorHandler } from "./common/monaco-utils.js";
import { registerLanguages } from "./languages/language-registry.js";

declare const require: IRequire;

interface IRequire {
	(dependencies: string[], callback: (...resolvedDependecies: any[]) => void): void;
	config(value: IRequireConfig): void;
}

interface IRequireConfig {
	paths?: Record<string, string>;
	"vs/nls"?: {
		availableLanguages: Record<string, string>;
	};
}

let monacoLoaded: Promise<void> | undefined;

export function loadMonaco(): Promise<void> {
	if (monacoLoaded === undefined) {
		monacoLoaded = new Promise<void>(resolve => {
			require.config({ paths: { vs: "lib/monaco-editor/dev/vs" } });
			// require.config({
			// 	"vs/nls": {
			// 		availableLanguages: {
			// 			"*": "de"
			// 		}
			// 	}
			// });
			require(["vs/editor/editor.main"], () => {
				require(["vs/editor/common/config/editorZoom"], (editorZoom: { EditorZoom: monaco.editor.IEditorZoom; }) => {
					monaco.editor.EditorZoom = editorZoom.EditorZoom;
					const editorOpenService = new EditorOpenService();
					monaco.editor.registerEditorOpener = opener => editorOpenService.registerOpener(opener);
					registerLanguages();
					registerPromiseCanceledErrorHandler();
					patchKeybindings();
					resolve();
				});
			});
		});
	}
	return monacoLoaded;
}

/** CAUTION: Internal unofficial API */
const enum EditorOpenContext {

	/**
	 * Default: the editor is opening via a programmatic call
	 * to the editor service API.
	 */
	API,

	/**
	 * Indicates that a user action triggered the opening, e.g.
	 * via mouse or keyboard use.
	 */
	USER
}

class EditorOpenService {
	private readonly openers: Set<monaco.editor.ICodeEditorOpener> = new Set();

	constructor() {
		let listener: monaco.IDisposable | undefined = monaco.editor.onDidCreateEditor(editor => {
			this.patchMonacoOpenEditorMethod(editor);
			listener?.dispose();
			listener = undefined;
		});
	}

	registerOpener(opener: monaco.editor.ICodeEditorOpener): monaco.IDisposable {
		this.openers.add(opener);
		let remove: (() => void) | undefined = () => this.openers.delete(opener);
		return toDisposable(() => {
			remove?.();
			remove = undefined;
		});
	}

	private patchMonacoOpenEditorMethod(editor: monaco.editor.ICodeEditor) {
		// this is global for all editors
		const editorService = editor._codeEditorService;
		const openEditorBase = editorService.openCodeEditor.bind(editorService);
		editorService.openCodeEditor = async (input: monaco.editor.IResourceEditorInput, source: monaco.editor.ICodeEditor) => {
			const result = await openEditorBase(input, source);
			if (result === null) {
				let handled = false;
				for (const opener of this.openers.values()) {
					handled = await opener.openCodeEditor(source, input.resource, input.options?.selection);
					if (handled)
						break;
				}
				if (!handled) {
					// fallback for "go to definition" which we try to convert into a "peek definition"
					const peekDefinitionAction = source.getAction("editor.action.peekDefinition");
					if (input.options?.context !== EditorOpenContext.USER && peekDefinitionAction?.isSupported()) {
						// We get here if a go to definition action failed (i.e. it's a programmatic call that tried to open another model).
						// In that case we try using a peek definition instead to reduce the number of cases where an error message is shown.
						peekDefinitionAction.run();
					} else {
						// We get here in all other cases and show an error message (e.g. if a user clicks on a link inside a JS error message "x was also defined here").
						const messageController = source.getContribution<monaco.editor.IMessageController>("editor.contrib.messageController");
						const position = source.getPosition() ?? { lineNumber: 1, column: 1 };
						messageController?.showMessage(`Cannot open resource '${input.resource.path}'. If possible, try using a 'peek' action instead.`, position);
					}
				}
			}
			return result; // always return the base result
		};
	}
}
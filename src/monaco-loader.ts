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
				const editorOpenService = new EditorOpenService();
				monaco.editor.registerEditorOpener = opener => editorOpenService.registerOpener(opener);
				registerLanguages();
				registerPromiseCanceledErrorHandler();
				patchKeybindings();
				resolve();
			});
		});
	}
	return monacoLoaded;
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
				for (const opener of this.openers.values()) {
					if (await opener.openCodeEditor(source, input.resource, input.options?.selection))
						break;
				}
			}
			return result; // always return the base result
		};
	}
}
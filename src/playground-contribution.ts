import { CodeEditor } from "./code-editor";

const contextMenuGroupId = "7_playground";

/**
 * Adds typical test scenarios to the editor to aid exploring APIs.
 */
export class PlaygroundContribution implements monaco.IDisposable {
	private disposables: monaco.IDisposable[] = [];

	constructor(private editor: CodeEditor) {
		this.addTestActions();
		this.addLinkOpenInterceptor();
	}

	private addTestActions() {
		this.disposables.push(this.editor.editor.addAction({
			id: "toggle_readonly",
			label: "Toggle Readonly State",
			keybindings: [monaco.KeyCode.F11],
			contextMenuGroupId,
			run: () => this.editor.setReadonly(!this.editor.isReadonly())
		}));

		this.disposables.push(this.editor.editor.addAction({
			id: "dispose",
			label: "Dispose All (refresh afterwards)",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D)],
			contextMenuGroupId,
			run: () => this.editor.dispose()
		}));
	}

	/**
	 * Example to intercept links that are opened.
	 */
	private addLinkOpenInterceptor() {
		const linkDetector = this.editor.editor.getContribution<monaco.editor.ILinkDetector>("editor.linkDetector");
		linkDetector.openerService._openers.unshift({
			async open(resource: string | monaco.Uri) {
				if (typeof resource === "string")
					resource = monaco.Uri.parse(resource);
				console.log("Opening: ", resource);
				return false; // was this resource handled?
			}
		});
	}

	/**
	 * Example to intercept go to definition requests.
	 */
	private addOpenEditorInterceptor() {
		const editorService = this.editor.editor._codeEditorService;
		const openEditorBase = editorService.openCodeEditor.bind(editorService);
		editorService.openCodeEditor = async (input: monaco.editor.IResourceEditorInput, source: monaco.editor.ICodeEditor) => {
			const result = await openEditorBase(input, source);
			if (result === null) {
				console.log("Open definition here...", input);
				console.log("Corresponding model: ", monaco.editor.getModel(input.resource));
			}
			return result; // always return the base result
		};
	}

	dispose() {
		for (const disposable of this.disposables)
			disposable.dispose();
	}
}
import { CodeEditor } from "./code-editor.js";
import { Disposable } from "./disposable.js";
import { getKeybindings } from "./monaco-utils.js";

const contextMenuGroupId = "7_playground";

/**
 * Adds typical test scenarios to the editor to aid exploring APIs.
 */
export class PlaygroundContribution extends Disposable {
	constructor(private editor: CodeEditor) {
		super();
		this.addTestActions();
		this.addLinkOpenInterceptor();
		this.addOpenEditorInterceptor();
	}

	private addTestActions() {
		this.register(this.editor.editor.addAction({
			id: "toggle_readonly",
			label: "Toggle Readonly State",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R)],
			contextMenuGroupId,
			run: () => this.editor.setReadonly(!this.editor.isReadonly())
		}));

		this.register(this.editor.editor.addAction({
			id: "dispose",
			label: "Dispose (refresh afterwards)",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D)],
			contextMenuGroupId,
			run: () => this.editor.dispose()
		}));

		this.register(this.editor.editor.addAction({
			id: "dump_keybindings",
			label: "Dump keybindings",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K)],
			contextMenuGroupId,
			run: () => console.log(JSON.stringify(getKeybindings(this.editor.editor)))
		}));

		this.register(this.editor.editor.addAction({
			id: "todo_test_code",
			label: "Add TODO test code",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyCode.KEY_T)],
			contextMenuGroupId,
			run: () => this.editor.appendLine(`// TODO asdf
/*
 * TODO qwer
 TODO mnzxcv
 */
/**
 * TODO etry
 */
const TODO = 1;
1 * TODO;`)
		}));

		this.register(this.editor.editor.addAction({
			id: "linq_test_code",
			label: "Add LINQ test code",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyCode.KEY_L)],
			contextMenuGroupId,
			run: () => this.editor.appendLine(`linq.execute('a x.id.toString() === "asdf" asdf ');
linq.execute(\`a x.id.toString() === "asdf" asdf \`);
linq.execute(\`a x.id.toString() === "\${text}" asdf \`);
linq.execute('a x.id.toString() === "' + foo + '" asdf ');`)
		}));
	}

	/**
	 * Example to intercept links that are opened. Works per editor instance.
	 */
	private addLinkOpenInterceptor() {
		const linkDetector = this.editor.editor.getContribution<monaco.editor.ILinkDetector>("editor.linkDetector");
		const remove = linkDetector.openerService._openers.unshift({
			async open(resource: string | monaco.Uri) {
				if (typeof resource === "string")
					resource = monaco.Uri.parse(resource);
				console.log("Opening: ", resource);
				return false; // was this resource handled?
			}
		});
		this.register({
			dispose() {
				remove();
			}
		});
	}

	/**
	 * Example to intercept go to definition requests. Works globally for all editor instances.
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
		this.register({
			dispose() {
				editorService.openCodeEditor = openEditorBase;
			}
		});
	}
}
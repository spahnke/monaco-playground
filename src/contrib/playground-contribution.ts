import { Disposable } from "../common/disposable.js";
import { getKeybindings } from "../common/monaco-utils.js";
import { allowTopLevelReturn, enableJavaScriptBrowserCompletion, restartLanguageServer } from "../languages/javascript/javascript-extensions.js";
import { CodeEditor } from "../code-editor.js";

const contextMenuGroupId = "7_playground";
const linqTestCode = `const query = foo + 'a x.id.toString() === "' + foo + \`" a x.id.toString() !== "\${text}" asdf\` + foo;
const query2 = query;
linq.execute('a x.id.toString() === "asdf" asdf x.id.toString() === "qwer"');
linq.execute(\`a x.id.toString() === "asdf" asdf\`);
linq.execute(\`a x.id.toString() === "\${text}" asdf\`);
linq.execute(foo + 'a x.id.toString() === "' + foo + '" asdf ' + \`a x.id.toString() !== "\${text}" asdf \` + foo);
linq.execute(query);
linq.execute(query2);`;
const todoTestCode = `// TODO asdf
/*
 * TODO qwer
 TODO mnzxcv
 */
/**
 * TODO etry
 */
const TODO = 1;
1 * TODO;`;

/**
 * Adds typical test scenarios to the editor to aid exploring APIs.
 */
export class PlaygroundContribution extends Disposable {
	constructor(private editor: CodeEditor) {
		super();
		this.addTestActions();
		this.addLinkOpenInterceptor();
		this.addOpenEditorInterceptor();
		this.addFontZoomEvent();
	}

	private addTestActions() {
		this.register(this.editor.editor.addAction({
			id: "toggle_readonly",
			label: "Toggle Readonly State",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyR)],
			contextMenuGroupId,
			run: () => this.editor.setReadonly(!this.editor.isReadonly())
		}));

		this.register(this.editor.editor.addAction({
			id: "dispose",
			label: "Dispose (refresh afterwards)",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyD)],
			contextMenuGroupId,
			run: () => this.editor.dispose()
		}));

		this.register(this.editor.editor.addAction({
			id: "dump_keybindings",
			label: "Dump keybindings",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyK)],
			contextMenuGroupId,
			run: (editor: monaco.editor.IStandaloneCodeEditor) => console.log(JSON.stringify(getKeybindings(editor)))
		}));

		this.register(this.editor.editor.addAction({
			id: "todo_test_code",
			label: "Add TODO test code",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyT)],
			contextMenuGroupId,
			run: () => this.editor.appendLine(todoTestCode)
		}));

		this.register(this.editor.editor.addAction({
			id: "linq_test_code",
			label: "Add LINQ test code",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyL)],
			contextMenuGroupId,
			run: () => this.editor.appendLine(linqTestCode)
		}));

		let topLevelReturn: monaco.IDisposable | undefined;
		this.register(this.editor.editor.addAction({
			id: "toggle_top_level_return",
			label: "Toggle Top Level Return",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR)],
			contextMenuGroupId,
			run: () => {
				if (topLevelReturn) {
					topLevelReturn.dispose();
					topLevelReturn = undefined;
				} else {
					topLevelReturn = allowTopLevelReturn();
				}
			}
		}));

		let browserCompletion: monaco.IDisposable | undefined;
		this.register(this.editor.editor.addAction({
			id: "toggle_browser_completion",
			label: "Toggle Browser Completion",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyB)],
			contextMenuGroupId,
			run: () => {
				if (browserCompletion) {
					browserCompletion.dispose();
					browserCompletion = undefined;
				} else {
					browserCompletion = enableJavaScriptBrowserCompletion();
				}
			}
		}));

		let inlayHintProvider: monaco.IDisposable | undefined;
		this.register(this.editor.editor.addAction({
			id: "toggle_inlay_hint_example",
			label: "Toggle Inlay Hint Example",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyI)],
			contextMenuGroupId,
			run: editor => {
				if (inlayHintProvider) {
					inlayHintProvider.dispose();
					inlayHintProvider = undefined;
				} else {
					inlayHintProvider = monaco.languages.registerInlayHintsProvider("javascript", {
						async provideInlayHints(model: monaco.editor.ITextModel, range: monaco.Range, token: monaco.CancellationToken): Promise<monaco.languages.InlayHintList> {
							return {
								hints: [
									{
										kind: monaco.languages.InlayHintKind.Parameter,
										position: editor.getPosition() ?? { lineNumber: 1, column: 1 },
										label: "testing"
									}
								],
								dispose() {}
							};
						}
					});
				}
			}
		}));

		this.register(this.editor.editor.addAction({
			id: "append_lines",
			label: "Append Lines",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL)],
			contextMenuGroupId,
			run: () => {
				this.editor.appendLine("asdf");
				this.editor.appendLine(" ");
				this.editor.appendLine("");
				this.editor.appendLine();
				this.editor.appendLine("qwer");
			}
		}));

		this.register(this.editor.editor.addAction({
			id: "restart_js_language_server",
			label: "Restart JS Language Server",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyS)],
			contextMenuGroupId,
			run: () => restartLanguageServer()
		}));
	}

	/**
	 * Example to intercept links that are opened.
	 */
	private addLinkOpenInterceptor() {
		this.register(this.editor.registerLinkOpener({
			async open(resource: monaco.Uri): Promise<boolean> {
				console.log("Opening: ", resource);
				return false;
			}
		}));
	}

	/**
	 * Example to intercept go to definition requests. Works globally for all editor instances.
	 */
	private addOpenEditorInterceptor() {
		this.register(monaco.editor.registerEditorOpener({
			async openCodeEditor(source: monaco.editor.ICodeEditor, resource: monaco.Uri, selection?: monaco.IRange): Promise<boolean> {
				console.log("Open definition here...", resource, selection);
				console.log("Corresponding model: ", monaco.editor.getModel(resource));
				return false;
			}
		}));
	}

	/**
	 * Example to subscribe to font zoom events. The same API can be used to get/set the zoom level programmatically.
	 */
	private addFontZoomEvent() {
		console.log(`Zoom Level: ${monaco.editor.EditorZoom.getZoomLevel()}`);
		monaco.editor.EditorZoom.onDidChangeZoomLevel(level => console.log(`Zoom Level: ${level}`));
	}
}
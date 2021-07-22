import { Disposable } from "../common/disposable.js";
import { EditorOpenContext, getKeybindings } from "../common/monaco-utils.js";
import { allowTopLevelReturn, enableJavaScriptBrowserCompletion } from "../languages/javascript/javascript-extensions.js";
import { CodeEditor } from "../code-editor.js";

const contextMenuGroupId = "7_playground";
const linqTestCode = `const query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
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
	}

	private addTestActions() {
		this.register(this.editor.editor.addAction({
			id: "toggle_readonly",
			label: "Toggle Readonly State",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyCode.KEY_R)],
			contextMenuGroupId,
			run: () => this.editor.setReadonly(!this.editor.isReadonly())
		}));

		this.register(this.editor.editor.addAction({
			id: "dispose",
			label: "Dispose (refresh afterwards)",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyCode.KEY_D)],
			contextMenuGroupId,
			run: () => this.editor.dispose()
		}));

		this.register(this.editor.editor.addAction({
			id: "dump_keybindings",
			label: "Dump keybindings",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyCode.KEY_K)],
			contextMenuGroupId,
			run: (editor: monaco.editor.IStandaloneCodeEditor) => console.log(JSON.stringify(getKeybindings(editor)))
		}));

		this.register(this.editor.editor.addAction({
			id: "todo_test_code",
			label: "Add TODO test code",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyCode.KEY_T)],
			contextMenuGroupId,
			run: () => this.editor.appendLine(todoTestCode)
		}));

		this.register(this.editor.editor.addAction({
			id: "linq_test_code",
			label: "Add LINQ test code",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyCode.KEY_L)],
			contextMenuGroupId,
			run: () => this.editor.appendLine(linqTestCode)
		}));

		let topLevelReturn: monaco.IDisposable | undefined;
		this.register(this.editor.editor.addAction({
			id: "toggle_top_level_return",
			label: "Toggle Top Level Return",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R)],
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
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyCode.KEY_B)],
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
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D, monaco.KeyCode.KEY_I)],
			contextMenuGroupId,
			run: editor => {
				if (inlayHintProvider) {
					inlayHintProvider.dispose();
					inlayHintProvider = undefined;
				} else {
					inlayHintProvider = monaco.languages.registerInlayHintsProvider("javascript", {
						async provideInlayHints(model: monaco.editor.ITextModel, range: monaco.Range, token: monaco.CancellationToken): Promise<monaco.languages.InlayHint[]> {
							return [
								{
									kind: monaco.languages.InlayHintKind.Other,
									position: editor.getPosition() ?? { lineNumber: 1, column: 1 },
									text: "testing"
								}
							];
						}
					});
				}
			}
		}));
	}

	/**
	 * Example to intercept links that are opened.
	 */
	private addLinkOpenInterceptor() {
		this.editor.registerLinkOpener({
			async open(resource: monaco.Uri): Promise<boolean> {
				console.log("Opening: ", resource);
				return false;
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
				const peekDefinitionAction = source.getAction("editor.action.peekDefinition");
				if (input.options?.context !== EditorOpenContext.USER && peekDefinitionAction?.isSupported()) {
					// We get here if a go to definition action failed (i.e. it's a programmatic call that tried to open another model).
					// In that case we try using a peek definition instead to reduce the number of cases where an error message is shown.
					peekDefinitionAction.run();
				} else {
					// We get here in all other cases and show an error message (e.g. if a user clicks on a link inside a JS error message "x was also defined here").
					const messageController = source.getContribution<monaco.editor.IMessageController>("editor.contrib.messageController");
					const position = source.getPosition() ?? { lineNumber: 1, column: 1 };
					messageController.showMessage(`Cannot open resource '${input.resource.path}'. If possible, try using a 'peek' action instead.`, position);
				}
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
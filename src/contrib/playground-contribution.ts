import { Disposable } from "../common/disposable.js";
import { allowTopLevelReturn, enableJavaScriptBrowserCompletion, restartLanguageServer } from "../languages/javascript/javascript-extensions.js";
import { CodeEditor } from "../code-editor.js";
import { CodeEditorTextInput } from "../code-editor-text-input.js";

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
		this.register(monaco.editor.registerLinkOpener({
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

// example from https://github.com/microsoft/vscode/blob/9216747901d28de7a0ea8ffbf9d11b6c9dc253b8/src/vs/workbench/contrib/interactiveEditor/browser/interactiveEditorWidget.ts#L1051
export function registerSlashCommands(textInput: CodeEditorTextInput, commands: { command: string, detail: string; }[]): monaco.IDisposable {
	const model = textInput.editor.getModel();
	if (!model)
		return Disposable.None;

	const disposable = new Disposable();
	const selector: monaco.languages.LanguageSelector = { scheme: model.uri.scheme, pattern: model.uri.path, language: model.getLanguageId() };
	disposable.register(monaco.languages.registerCompletionItemProvider(selector, new class implements monaco.languages.CompletionItemProvider {
		readonly triggerCharacters?: string[] = ["/"];

		provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.languages.CompletionContext, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
			if (position.lineNumber !== 1 && position.column !== 1)
				return undefined;

			const suggestions: monaco.languages.CompletionItem[] = commands.map(command => {

				const withSlash = `/${command.command}`;

				return {
					label: withSlash,
					insertText: `${withSlash} $0`,
					insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
					kind: monaco.languages.CompletionItemKind.Text,
					range: new monaco.Range(1, 1, 1, 1),
					detail: command.detail
				};
			});

			return { suggestions };
		}
	}));

	const decorations = textInput.editor.createDecorationsCollection();

	const updateSlashDecorations = () => {
		const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];
		for (const command of commands) {
			const withSlash = `/${command.command}`;
			const firstLine = model.getLineContent(1);
			if (firstLine.startsWith(withSlash)) {
				newDecorations.push({
					range: new monaco.Range(1, 1, 1, withSlash.length + 1),
					options: {
						inlineClassName: "monaco-single-line-slash-command",
					}
				});

				// inject detail when otherwise empty
				if (firstLine === `/${command.command} `) {
					newDecorations.push({
						range: new monaco.Range(1, withSlash.length + 1, 1, withSlash.length + 2),
						options: {
							after: {
								content: `${command.detail}`,
								inlineClassName: "monaco-single-line-slash-command-detail"
							}
						}
					});
				}
				break;
			}
		}
		decorations.set(newDecorations);
	};

	disposable.register(textInput.editor.onDidChangeModelContent(updateSlashDecorations));

	return disposable;
}
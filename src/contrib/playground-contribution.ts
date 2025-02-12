import { Disposable } from "../common/disposable.js";
import { isInComment, waitForTokenization } from "../common/monaco-utils.js";
import { allowTopLevelReturn, enableJavaScriptBrowserCompletion, getEsLintWorker, restartLanguageServer } from "../languages/javascript/javascript-extensions.js";
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

const colorProviderTestCode = `
Color.createFromRgb(100, 150, 200);
Color.createFromRgba(100, 200, 150, 200);
Color.createFromRgb(0x64, 0x96, 0xc8); // not supported yet
// Color.createFromRgb(100, 150, 200);
/* Color.createFromRgb(100, 150, 200) */
/** Color.createFromRgb(100, 150, 200) */
parseInt(""); // Color.createFromRgb(100, 150, 200)
parseInt(""); /* Color.createFromRgb(100, 150, 200) */
// #ffaaddcc this doesn't work anymore after registering a custom color provider because it's a fallback`;

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
		this.addColorProviderExample();
		this.addCursorAlignAction();
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

		this.register(this.editor.editor.addAction({
			id: "color_provider_test_code",
			label: "Add color provider test code",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyC)],
			contextMenuGroupId,
			run: () => this.editor.appendLine(colorProviderTestCode)
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

		this.register(this.editor.editor.addAction({
			id: "dump_typescript_version",
			label: "Dump TS Version",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyV)],
			contextMenuGroupId,
			run: () => console.log(monaco.languages.typescript.typescriptVersion)
		}));

		this.register(this.editor.editor.addAction({
			id: "dump_eslint_version",
			label: "Dump ESLint Version",
			keybindings: [monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, monaco.KeyCode.KeyE)],
			contextMenuGroupId,
			run: async () => {
				const worker = await getEsLintWorker();
				if (worker) {
					const version = await worker.getVersion();
					console.log(version);
				}
			}
		}));

		this.register(this.editor.editor.addAction({
			id: "dump_editor_object",
			label: "Dump Editor Object",
			run: editor => console.log(editor)
		}));

		this.register(this.editor.editor.addAction({
			id: "dump_keybindings_text",
			label: "Dump Keybindings Text",
			run: (editor: any) => {
				// CAUTION: Internal unofficial API
				const keybindings: string[] = editor._standaloneKeybindingService._cachedResolver._keybindings.map((x: any) => `${x.chords}\t${x.command}${x.when ? " (" + x.when.serialize() + ")" : ""}`);
				keybindings.sort((a, b) => a.localeCompare(b, "en-US", { caseFirst: "lower" }));
				let maxColumn = 0;
				for (const keybinding of keybindings) {
					const seperatorColumn = keybinding.indexOf("\t");
					maxColumn = Math.max(maxColumn, seperatorColumn);
				}
				for (let i = 0; i < keybindings.length; i++) {
					const seperatorColumn = keybindings[i].indexOf("\t");
					keybindings[i] = keybindings[i].replace("\t", " ".repeat(maxColumn - seperatorColumn + 1));
				}
				console.log(keybindings.join("\n"));
			}
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
			openCodeEditor(source: monaco.editor.ICodeEditor, resource: monaco.Uri, selectionOrPosition?: monaco.IRange | monaco.IPosition): boolean {
				console.log("Open definition here...", resource, selectionOrPosition);
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
		this.register(monaco.editor.EditorZoom.onDidChangeZoomLevel(level => console.log(`Zoom Level: ${level}`)));
	}

	private addColorProviderExample() {
		this.editor.addLibrary({
			contents: `
interface Color {
	readonly alpha: number;
	readonly blue: number;
	readonly green: number;
	readonly red: number;
}

interface ColorConstructor {
	createFromRgb(red: number, green: number, blue: number): Color;
	createFromRgba(red: number, green: number, blue: number, alpha: number): Color;
}

declare var Color: ColorConstructor;`,
			language: "typescript",
			filePath: "color.d.ts"
		});

		this.register(monaco.languages.registerColorProvider("javascript", new class implements monaco.languages.DocumentColorProvider {
			async provideDocumentColors(model: monaco.editor.ITextModel, token: monaco.CancellationToken): Promise<monaco.languages.IColorInformation[] | null | undefined> {
				const colorMatches = model.findMatches("Color\\.createFromRgb(a?)\\(([^)]*)\\)", false, true, true, null, true);
				if (colorMatches.length === 0)
					return undefined; // return undefined in the empty case instead of always mapping, so the editor can fallback to the default color provider in that case

				const colors: monaco.languages.IColorInformation[] = [];
				for (const colorMatch of colorMatches) {
					if (!colorMatch.matches)
						continue;
					await waitForTokenization(model);
					if (isInComment(model, colorMatch.range))
						continue;

					const hasAlpha = colorMatch.matches[1] === "a";
					const params = colorMatch.matches[2];
					const rgbaMatcher = /^(?<r>\d+),\s*(?<g>\d+),\s*(?<b>\d+)(?:,\s*(?<a>\d+))?$/;
					const rgbaMatch = params.match(rgbaMatcher);
					if (!rgbaMatch)
						continue;

					const red = this.convertToColorComponent(rgbaMatch.groups?.["r"] ?? "");
					const green = this.convertToColorComponent(rgbaMatch.groups?.["g"] ?? "");
					const blue = this.convertToColorComponent(rgbaMatch.groups?.["b"] ?? "");
					const alpha = hasAlpha ? this.convertToColorComponent(rgbaMatch.groups?.["a"] ?? "") : 1;
					if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue))
						continue;
					if (hasAlpha && Number.isNaN(alpha))
						continue;
					colors.push({ color: { red, green, blue, alpha }, range: colorMatch.range });
				}
				return colors.length === 0 ? undefined : colors;
			}

			provideColorPresentations(model: monaco.editor.ITextModel, colorInfo: monaco.languages.IColorInformation, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.IColorPresentation[]> {
				const text = model.getValueInRange(colorInfo.range);
				const hasAlpha = text.startsWith("Color.createFromRgba");

				const red = Math.round(colorInfo.color.red * 255);
				const green = Math.round(colorInfo.color.green * 255);
				const blue = Math.round(colorInfo.color.blue * 255);
				const alpha = Math.round(colorInfo.color.alpha * 255);

				const label = hasAlpha
					? `Color.createFromRgba(${red}, ${green}, ${blue}, ${alpha})`
					: `Color.createFromRgb(${red}, ${green}, ${blue})`;
				return [{ label }];
			}

			private convertToColorComponent(s: string): number {
				// NaN values are propagated correctly through every statement so we don't need a special case here
				let color = Number.parseInt(s);
				color = Math.max(0, Math.min(color, 255));
				return color / 255;
			}
		}));
	}

	private addCursorAlignAction() {
		this.register(this.editor.editor.addAction({
			id: "cursor_align",
			label: "Align cursors",
			keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyA],
			run: editor => {
				const selections = editor.getSelections();
				if (!selections || selections.length <= 1)
					return;

				// we have multiple cursors in selections
				let maxColumn = 0;
				for (const selection of selections) {
					if (selection.selectionStartLineNumber !== selection.endLineNumber)
						return; // only allow selections on the same line
					maxColumn = Math.max(maxColumn, selection.startColumn);
				}

				const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
				for (let i = 0; i < selections.length; i++) {
					const selection = selections[i];
					const missingSpaces = maxColumn - selection.startColumn;
					if (missingSpaces > 0) {
						// add spaces for aligment                                                                                      this is correct; we want a collapsed range to insert
						edits.push({ range: new monaco.Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.startColumn), text: " ".repeat(missingSpaces) });
						selections[i] = new monaco.Selection(selection.startLineNumber, selection.startColumn + missingSpaces, selection.positionLineNumber, selection.positionColumn + missingSpaces);
					}
				}

				if (edits.length > 0)
					editor.executeEdits("cursor_align", edits, selections);
			}
		}));
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

			const suggestions = commands.map<monaco.languages.CompletionItem>(command => {
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
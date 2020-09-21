import { setDiagnosticOptions, setLibs } from "./languages/javascript/javascript-extensions.js";
import { addLibrary, ILibrary, MonacoHelper, usuallyProducesCharacter } from "./monaco-helper.js";

let ContextKeyExpr: monaco.platform.IContextKeyExprFactory;
let editorZoom: monaco.editor.IEditorZoom;

export class CodeEditor {
	public editor: monaco.editor.IStandaloneCodeEditor;
	private disposables: monaco.IDisposable[] = [];
	private readonlyHandler: monaco.IDisposable | undefined;

	static async create(element: HTMLElement, language?: string, allowTopLevelReturn: boolean = false): Promise<CodeEditor> {
		await MonacoHelper.loadEditor();
		ContextKeyExpr = await MonacoHelper.ContextKeyExpr;
		editorZoom = await MonacoHelper.editorZoom;
		return new CodeEditor(monaco.editor.create(element, {
			automaticLayout: true,
			fixedOverflowWidgets: true,
			fontSize: 13,
			formatOnPaste: true,
			formatOnType: true,
			language,
			lightbulb: { enabled: true },
			minimap: { enabled: true },
			mouseWheelZoom: true,
			quickSuggestions: {
				comments: true,
				other: false,
				strings: true,
			},
			renderValidationDecorations: "on",
			renderWhitespace: "selection",
			showUnused: true,
			suggest: {
				statusBar: {
					visible: true
				}
			},
			theme: "vs",
		}), allowTopLevelReturn);
	}

	private constructor(editor: monaco.editor.IStandaloneCodeEditor, allowTopLevelReturn: boolean = false) {
		this.editor = editor;
		this.addCommands();
		this.addReadonlyHandling();
		this.patchExistingKeyBindings();
		if (allowTopLevelReturn)
			setDiagnosticOptions(allowTopLevelReturn ? [/*top-level return*/ 1108] : []);
	}

	setContents(content: string, language?: string, fileName?: string) {
		this.disposeModel();
		const uri = monaco.Uri.file(fileName ?? "app.js");
		const model = monaco.editor.createModel(content, language, uri);
		this.editor.setModel(model);
	}

	appendLine(line?: string) {
		const model = this.editor.getModel();
		if (model === null)
			return;
		model.pushEditOperations(this.editor.getSelections() ?? [], [{
			text: line === undefined ? model.getEOL() : line,
			range: new monaco.Range(model.getLineCount(), 0, model.getLineCount(), 0), // empty range for insert
		}], () => []);
	}

	getText(): string {
		return this.editor.getValue();
	}

	focus() {
		this.editor.focus();
	}

	setReadonly(value: boolean) {
		this.editor.updateOptions({
			readOnly: value,
			lightbulb: { enabled: !value } // because of https://github.com/microsoft/monaco-editor/issues/1596
		});
	}

	isReadonly(): boolean {
		return this.editor.getOptions().get(monaco.editor.EditorOption.readOnly);
	}

	getSelectedText(): string | undefined {
		const selection = this.editor.getSelection();
		if (selection === null)
			return undefined;
		return this.editor.getModel()?.getValueInRange(selection);
	}

	replaceSelectedText(newText: string) {
		const selection = this.editor.getSelection();
		if (newText !== null && selection !== null)
			this.editor.executeEdits("replace", [{ range: selection, text: newText }]);
	}

	getLine(): number | undefined {
		const position = this.editor.getPosition();
		return position?.lineNumber;
	}

	gotoLine(line: number) {
		this.editor.setPosition({ lineNumber: line, column: 1 });
		this.editor.revealLineInCenterIfOutsideViewport(line);
	}

	getOffset(): number | undefined {
		const position = this.editor.getPosition();
		if (position === null)
			return undefined;
		return this.editor.getModel()?.getOffsetAt(position);
	}

	gotoOffset(offset: number) {
		const model = this.editor.getModel();
		if (model === null)
			return;
		const position = model.getPositionAt(offset);
		this.editor.setPosition(position);
		this.editor.revealPositionInCenterIfOutsideViewport(position);
	}

	zoomIn() {
		this.editor.trigger("zoom", "editor.action.fontZoomIn", null);
	}

	zoomOut() {
		this.editor.trigger("zoom", "editor.action.fontZoomOut", null);
	}

	resetZoom() {
		console.log(editorZoom);
		this.editor.trigger("zoom", "editor.action.fontZoomReset", null);
	}

	format() {
		const selection = this.editor.getSelection();
		if (selection === null || selection.isEmpty())
			this.editor.trigger("format", "editor.action.formatDocument", null);
		else
			this.editor.trigger("format", "editor.action.formatSelection", null);
	}

	getCurrentWord(): string | undefined {
		const position = this.editor.getPosition();
		if (position === null)
			return undefined;
		return this.editor.getModel()?.getWordAtPosition(position)?.word;
	}

	addChangeListener(listener: () => void) {
		this.editor.onDidChangeModelContent(e => listener());
	}

	addLibrary(library: ILibrary) {
		this.disposables.push(...addLibrary(library));
	}

	enableJavaScriptBrowserCompletion() {
		setLibs(["esnext", "dom"]);
	}

	async getJavaScriptWorker(): Promise<any> {
		const model = this.editor.getModel();
		if (model === null || model.getModeId() !== "javascript")
			throw new Error("Only available for JavaScript documents.")
		const worker = await monaco.languages.typescript.getJavaScriptWorker();
		return await worker(model.uri);
	}

	dispose() {
		for (const disposable of this.disposables)
			disposable.dispose();
		this.readonlyHandler?.dispose();
		this.disposeModel();
		this.editor.dispose();
	}

	private disposeModel() {
		this.editor.getModel()?.dispose();
	}

	private addCommands() {
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_EQUAL, () => this.zoomIn());
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_MINUS, () => this.zoomOut());
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_0, () => this.resetZoom());
	}

	private addReadonlyHandling() {
		// needed because of https://github.com/microsoft/monaco-editor/issues/1873
		this.createOrDestroyReadonlyHandler();
		this.disposables.push(this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(monaco.editor.EditorOption.readOnly)) {
				this.createOrDestroyReadonlyHandler();
			}
		}));
	}

	private createOrDestroyReadonlyHandler() {
		if (this.isReadonly()) {
			this.readonlyHandler = this.editor.onKeyDown(e => {
				if (!e.ctrlKey && !e.altKey && !e.metaKey) {
					if (usuallyProducesCharacter(e.keyCode)) {
						this.editor.trigger("", "type", { text: "nothing" });
					}
				}
			});
		} else {
			this.readonlyHandler?.dispose();
		}
	}

	private patchExistingKeyBindings() {
		this.patchKeyBinding("editor.action.quickFix", monaco.KeyMod.Alt | monaco.KeyCode.Enter); // Default is Ctrl+.
		this.patchKeyBinding("editor.action.quickOutline", monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_O); // Default is Ctrl+Shift+O
		this.patchKeyBinding("editor.action.rename", monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R)); // Default is F2
	}

	private patchKeyBinding(id: string, newKeyBinding?: number, context?: string) {
		console.log(this.editor._standaloneKeybindingService);
		// TODO how to remove an existing keybinding?
		// this.editor._standaloneKeybindingService.addDynamicKeybinding(`-${id}`); // remove existing one; no official API yet
		if (newKeyBinding) {
			const action = this.editor.getAction(id);
			const when = ContextKeyExpr.deserialize(context);
			this.editor._standaloneKeybindingService.addDynamicKeybinding(id, newKeyBinding, () => action.run(), when);
		}
	}
}
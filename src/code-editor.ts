import { setCompilerOptions, setDiagnosticOptions } from "./languages/javascript/javascript-extensions.js";
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
		this.addReadonlyHandling();
		this.patchKeybindings();
		if (allowTopLevelReturn)
			setDiagnosticOptions(allowTopLevelReturn ? [/*top-level return*/ 1108] : []);
	}

	setContents(content: string, language?: string, fileName?: string) {
		this.disposeModel();
		const uri = fileName !== undefined ? monaco.Uri.file(fileName) : undefined;
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
			lightbulb: { enabled: !value }, // because of https://github.com/microsoft/monaco-editor/issues/1596
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
		const oldLibs = monaco.languages.typescript.javascriptDefaults.getCompilerOptions().lib ?? [];
		setCompilerOptions(["esnext", "dom"]);
		this.disposables.push({ dispose() { setCompilerOptions(oldLibs); } });
	}

	async getJavaScriptWorker(): Promise<monaco.languages.typescript.TypeScriptWorker> {
		const model = this.editor.getModel();
		if (model === null || model.getModeId() !== "javascript")
			throw new Error("Only available for JavaScript documents.")
		const worker = await monaco.languages.typescript.getJavaScriptWorker();
		return worker(model.uri);
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

	private patchKeybindings() {
		// console.log(JSON.stringify(MonacoHelper.getKeybindings(this.editor)));
		this.patchKeybinding("editor.action.fontZoomIn", monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_EQUAL); // no default
		this.patchKeybinding("editor.action.fontZoomOut", monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_MINUS); // no default
		this.patchKeybinding("editor.action.fontZoomReset", monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_0); // no default
		this.patchKeybinding("editor.action.marker.nextInFiles"); // default F8 (jumps between files/models which is not desirable)
		this.patchKeybinding("editor.action.marker.prevInFiles"); // default Shift+F8 (jumps between files/models which is not desirable)
		this.patchKeybinding("editor.action.quickFix", monaco.KeyMod.Alt | monaco.KeyCode.Enter, "editorHasCodeActionsProvider && editorTextFocus && !editorReadonly"); // default is Ctrl+.
		this.patchKeybinding("editor.action.quickOutline", monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_O, "editorFocus && editorHasDocumentSymbolProvider"); // default is Ctrl+Shift+O
		this.patchKeybinding("editor.action.rename", monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R), "editorHasRenameProvider && editorTextFocus && !editorReadonly"); // default is F2
	}

	private patchKeybinding(id: string, newKeyBinding?: number, context?: string): void {
		// remove existing one; no official API yet
		// the '-' before the commandId removes the binding
		// as of >=0.21.0 we need to supply a dummy command handler to not get errors (because of the fix for https://github.com/microsoft/monaco-editor/issues/1857)
		this.editor._standaloneKeybindingService.addDynamicKeybinding(`-${id}`, undefined, () => { });
		if (newKeyBinding) {
			const action = this.editor.getAction(id);
			const when = ContextKeyExpr.deserialize(context);
			this.editor._standaloneKeybindingService.addDynamicKeybinding(id, newKeyBinding, () => action.run(), when);
		}
	}
}
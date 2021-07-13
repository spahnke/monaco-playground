import { Disposable } from "./common/disposable.js";
import { addLibrary, ILibrary, patchKeybinding } from "./common/monaco-utils.js";
import { MonacoLoader } from "./monaco-loader.js";

let ContextKeyExpr: monaco.platform.IContextKeyExprFactory;
let editorZoom: monaco.editor.IEditorZoom;

class LocalStorageEditorConfiguration implements monaco.IDisposable {
	constructor(private readonly editor: monaco.editor.IEditor) {
		window.addEventListener("storage", this.storageEventHandler);
		this.updateConfiguration();
	}

	dispose() {
		window.removeEventListener("storage", this.storageEventHandler);
	}

	private get localStorageKey() {
		return "monaco-config";
	}

	private storageEventHandler = (e: StorageEvent) => {
		if (e.key === this.localStorageKey)
			this.updateConfiguration();
	};

	private updateConfiguration() {
		const rawConfig = localStorage.getItem(this.localStorageKey);
		if (rawConfig === null)
			return;
		try {
			const config = JSON.parse(rawConfig) as monaco.editor.IEditorOptions;
			this.editor.updateOptions(config);
		} catch {
			console.warn("[Monaco] Couldn't parse editor configuration");
		}
	}
}

export class CodeEditor extends Disposable {
	static async create(element: HTMLElement, language?: string): Promise<CodeEditor> {
		await MonacoLoader.loadEditor();
		ContextKeyExpr = await MonacoLoader.ContextKeyExpr;
		editorZoom = await MonacoLoader.editorZoom;
		return new CodeEditor(monaco.editor.create(element, {
			automaticLayout: true,
			fixedOverflowWidgets: true,
			fontLigatures: true,
			fontSize: 13,
			formatOnPaste: true,
			formatOnType: true,
			inlayHints: {
				enabled: true,
			},
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
			showDeprecated: true,
			showUnused: true,
			suggest: {
				preview: true,
				showDeprecated: true,
				showStatusBar: true,
			},
			theme: "vs",
		}));
	}

	private constructor(public readonly editor: monaco.editor.IStandaloneCodeEditor) {
		super();
		this.editor = editor;
		this.register(new LocalStorageEditorConfiguration(editor));
		this.patchKeybindings(this.editor);
	}

	setContents(content: string, language?: string, fileName?: string): void {
		this.editor.getModel()?.dispose();
		const uri = fileName !== undefined ? monaco.Uri.file(fileName) : undefined;
		const model = monaco.editor.createModel(content, language, uri);
		model.updateOptions({
			insertSpaces: false,
			tabSize: 4,
			trimAutoWhitespace: true
		});
		this.editor.setModel(model);
	}

	appendLine(line?: string): void {
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

	focus(): void {
		this.editor.focus();
	}

	setReadonly(value: boolean): void {
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

	replaceSelectedText(newText: string): void {
		const selection = this.editor.getSelection();
		if (newText !== null && selection !== null)
			this.editor.executeEdits("replace", [{ range: selection, text: newText }]);
	}

	getLine(): number | undefined {
		const position = this.editor.getPosition();
		return position?.lineNumber;
	}

	gotoLine(line: number): void {
		this.editor.setPosition({ lineNumber: line, column: 1 });
		this.editor.revealLineInCenterIfOutsideViewport(line);
	}

	getOffset(): number | undefined {
		const position = this.editor.getPosition();
		if (position === null)
			return undefined;
		return this.editor.getModel()?.getOffsetAt(position);
	}

	gotoOffset(offset: number): void {
		const model = this.editor.getModel();
		if (model === null)
			return;
		const position = model.getPositionAt(offset);
		this.editor.setPosition(position);
		this.editor.revealPositionInCenterIfOutsideViewport(position);
	}

	zoomIn(): void {
		this.editor.trigger("zoom", "editor.action.fontZoomIn", null);
	}

	zoomOut(): void {
		this.editor.trigger("zoom", "editor.action.fontZoomOut", null);
	}

	resetZoom(): void {
		console.log(editorZoom);
		this.editor.trigger("zoom", "editor.action.fontZoomReset", null);
	}

	format(): Promise<void> {
		const selection = this.editor.getSelection();
		if (selection === null || selection.isEmpty())
			return this.editor.getAction("editor.action.formatDocument").run();
		return this.editor.getAction("editor.action.formatSelection").run();
	}

	/**
	 * Returns `true` as soon as a formatting provider is ready. If no formatting provider is registered within 2 seconds the method returns `false`.
	 */
	async waitOnFormattingProvider(): Promise<boolean> {
		const action = this.editor.getAction("editor.action.formatDocument");
		if (action.isSupported())
			return true;

		const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
		let remainingIterations = 20;
		while (remainingIterations-- > 0) {
			await sleep(100);
			if (action.isSupported())
				return true;
		}
		return false;
	}

	getCurrentWord(): string | undefined {
		const position = this.editor.getPosition();
		if (position === null)
			return undefined;
		return this.editor.getModel()?.getWordAtPosition(position)?.word;
	}

	addChangeListener(listener: () => void): void {
		this.editor.onDidChangeModelContent(e => listener());
	}

	addLibrary(library: ILibrary): void {
		this.register(addLibrary(library));
	}

	override dispose(): void {
		super.dispose();
		this.editor.getModel()?.dispose();
		this.editor.dispose();
	}

	private patchKeybindings(editor: monaco.editor.IStandaloneCodeEditor) {
		patchKeybinding(editor, "editor.action.fontZoomIn", monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_EQUAL); // no default
		patchKeybinding(editor, "editor.action.fontZoomOut", monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_MINUS); // no default
		patchKeybinding(editor, "editor.action.fontZoomReset", monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_0); // no default
		patchKeybinding(editor, "editor.action.marker.nextInFiles"); // default F8 (jumps between files/models which is not desirable)
		patchKeybinding(editor, "editor.action.marker.prevInFiles"); // default Shift+F8 (jumps between files/models which is not desirable)
		patchKeybinding(editor, "editor.action.quickFix", monaco.KeyMod.Alt | monaco.KeyCode.Enter, ContextKeyExpr.deserialize("editorHasCodeActionsProvider && editorTextFocus && !editorReadonly")); // default is Ctrl+.
		patchKeybinding(editor, "editor.action.quickOutline", monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_O, ContextKeyExpr.deserialize("editorFocus && editorHasDocumentSymbolProvider")); // default is Ctrl+Shift+O
		patchKeybinding(editor, "editor.action.rename", monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R), ContextKeyExpr.deserialize("editorHasRenameProvider && editorTextFocus && !editorReadonly")); // default is F2
	}
}
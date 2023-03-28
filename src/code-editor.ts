import { Disposable } from "./common/disposable.js";
import { addLibrary, delay, ILibrary } from "./common/monaco-utils.js";
import { loadMonaco } from "./monaco-loader.js";

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
		await loadMonaco();
		return new CodeEditor(monaco.editor.create(element, {
			automaticLayout: true,
			bracketPairColorization: {
				enabled: true,
			},
			fixedOverflowWidgets: true,
			fontLigatures: true,
			fontSize: 13,
			formatOnPaste: true,
			formatOnType: true,
			guides: {
				bracketPairs: true,
				bracketPairsHorizontal: false,
			},
			inlayHints: {
				enabled: "on"
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
		this.register(new LocalStorageEditorConfiguration(editor));
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
		line = (line ?? "") + model.getEOL();
		model.pushEditOperations(this.editor.getSelections() ?? [], [{
			text: line,
			range: new monaco.Range(model.getLineCount() + 1, 0, model.getLineCount() + 1, 0), // empty range for insert
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
		this.editor.trigger("zoom", "editor.action.fontZoomReset", null);
	}

	async format(): Promise<void> {
		const selection = this.editor.getSelection();
		if (selection === null || selection.isEmpty())
			return this.editor.getAction("editor.action.formatDocument")?.run();
		return this.editor.getAction("editor.action.formatSelection")?.run();
	}

	/**
	 * Returns `true` as soon as a formatting provider is ready. If no formatting provider is registered within 2 seconds the method returns `false`.
	 */
	async waitOnFormattingProvider(): Promise<boolean> {
		const action = this.editor.getAction("editor.action.formatDocument");
		if (!action)
			return false;
		if (action.isSupported())
			return true;

		let remainingIterations = 20;
		while (remainingIterations-- > 0) {
			await delay(100);
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
}

// inspired by https://github.com/vikyd/vue-monaco-singleline/blob/master/src/monaco-singleline.vue and https://github.com/microsoft/monaco-editor/issues/2009
export class SingleLineCodeEditor extends Disposable {
	static async create(element: HTMLElement, language?: string): Promise<SingleLineCodeEditor> {
		await loadMonaco();
		const editor = monaco.editor.create(element, {
			automaticLayout: true,
			contextmenu: false,
			cursorStyle: "line-thin",
			fixedOverflowWidgets: true,
			folding: false,
			fontLigatures: true,
			fontSize: 13,
			glyphMargin: false,
			language,
			lightbulb: { enabled: false },
			lineDecorationsWidth: 0,
			lineNumbers: "off",
			links: false,
			minimap: { enabled: false },
			occurrencesHighlight: false,
			overviewRulerLanes: 0,
			overviewRulerBorder: false,
			renderLineHighlight: "none",
			scrollBeyondLastColumn: 0,
			scrollbar: {
				horizontal: "hidden",
				vertical: "hidden",
				alwaysConsumeMouseWheel: false,
			},
			wordBasedSuggestions: false,
			wordWrap: "off",
		});
		element.className = "monaco-single-line";
		element.style.height = `${editor.getOption(monaco.editor.EditorOption.lineHeight)}px`;
		return new SingleLineCodeEditor(editor);
	}

	private constructor(private readonly editor: monaco.editor.IStandaloneCodeEditor) {
		super();
		editor.createContextKey("singleLine", "true");

		// disable find widget (use of the context key allows the browser default to be the fallback instead of suppressing it completely)
		this.register(monaco.editor.addKeybindingRule({ keybinding: 0, command: "-actions.find" }));
		this.register(monaco.editor.addKeybindingRule({ keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, command: "actions.find", when: "!singleLine && editorFocus" }));

		// disable command palette; this cannot be unbound through a keybinding rule
		this.register(editor.addAction({ id: "disableCommandPalette", label: "", keybindings: [monaco.KeyCode.F1], run: () => { } }));

		// suppress enter key and invoke a custom action
		this.register(editor.addAction({ id: "hijackEnter", label: "", keybindings: [monaco.KeyCode.Enter], run: editor => this.onEnter?.(editor.getValue()), precondition: "!suggestWidgetVisible" }));

		// TODO hijack paste
	}

	onEnter?: (value: string) => void;

	getText(): string {
		return this.editor.getValue();
	}

	setText(text: string): void {
		this.editor.setValue(text);
		// set cursor to end
		this.editor.setPosition({ lineNumber: 1, column: this.editor.getModel()?.getLineMaxColumn(1) ?? 1 });
	}

	focus(): void {
		this.editor.focus();
	}

	setReadonly(value: boolean): void {
		this.editor.updateOptions({ readOnly: value	});
	}

	isReadonly(): boolean {
		return this.editor.getOptions().get(monaco.editor.EditorOption.readOnly);
	}

	override dispose(): void {
		super.dispose();
		this.editor.dispose();
	}
}

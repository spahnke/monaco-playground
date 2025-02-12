import { Disposable } from "./common/disposable.js";
import { addLibrary, delay, ILibrary } from "./common/monaco-utils.js";
import { LocalStorageEditorConfiguration } from "./editor-config.js";

export class CodeEditor extends Disposable {
	static create(element: HTMLElement, language?: string): CodeEditor {
		return new CodeEditor(monaco.editor.create(element, {
			automaticLayout: true,
			bracketPairColorization: {
				enabled: true,
			},
			colorDecorators: true,
			defaultColorDecorators: false,
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
				enabled: "on",
			},
			language,
			lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.OnCode },
			minimap: {
				enabled: true,
				showMarkSectionHeaders: false,
				showRegionSectionHeaders: false,
			},
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
			stickyScroll: {
				enabled: false,
			},
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
			lightbulb: { enabled: value ? monaco.editor.ShowLightbulbIconMode.Off : monaco.editor.ShowLightbulbIconMode.OnCode }, // because of https://github.com/microsoft/monaco-editor/issues/1596
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
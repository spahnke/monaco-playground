import { Disposable } from "./common/disposable.js";
import { addLibrary, addTemplates, delay, ILibrary, ITemplate } from "./common/monaco-utils.js";
import { LocalStorageEditorConfiguration } from "./editor-config.js";

export interface CursorState {
	position: monaco.IPosition;
	selectedCharacters: number;
	selectedLines: number;
	selections: number;
}

export class CodeEditor extends Disposable {
	private cursorState: CursorState = { position: { lineNumber: 1, column: 1 }, selectedCharacters: 0, selectedLines: 0, selections: 0 };
	private readonly onDidCursorStateChangeEmitter = this.register(new monaco.Emitter<CursorState>());

	static create(element: HTMLElement, language?: string): CodeEditor {
		return new CodeEditor(monaco.editor.create(element, {
			automaticLayout: true,
			bracketPairColorization: {
				enabled: true,
			},
			colorDecorators: true,
			defaultColorDecorators: "never",
			definitionLinkOpensInPeek: true,
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
				enabled: "offUnlessPressed", // need to press Ctrl+Alt to show them
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
		this.register(this.editor.onDidChangeCursorPosition(e => {
			this.cursorState.position = e.position;
			this.onDidCursorStateChangeEmitter.fire(this.cursorState);
		}));
		this.register(this.editor.onDidChangeCursorSelection(e => {
			this.cursorState.selectedLines = 0;
			this.cursorState.selectedCharacters = 0;
			this.cursorState.selections = 1 + e.secondarySelections.length;
			for (const selection of [e.selection, ...e.secondarySelections]) {
				if (!monaco.Selection.isEmpty(selection)) {
					this.cursorState.selectedLines += selection.endLineNumber - selection.startLineNumber + 1;
					let selectedCharacters = selection.endColumn - selection.startColumn;
					if (monaco.Selection.spansMultipleLines(selection)) {
						const model = this.editor.getModel();
						if (model) {
							selectedCharacters = model.getOffsetAt(selection.getEndPosition()) - model.getOffsetAt(selection.getStartPosition());
						}
					}
					this.cursorState.selectedCharacters += selectedCharacters;
				}
			}
			this.onDidCursorStateChangeEmitter.fire(this.cursorState);
		}));
		this.register(new LocalStorageEditorConfiguration(editor));
	}

	readonly onDidCursorStateChange = this.onDidCursorStateChangeEmitter.event;

	/** Replaces the entire editor model, allowing a change of language and content. Does NOT preserve the undo stack! */
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

	/** Replaces the text of the current model (if there is one). Does NOT preserve the undo stack! */
	setText(text: string): void {
		this.editor.getModel()?.setValue(text);
	}

	focus(): void {
		this.editor.focus();
	}

	refresh(): void {
		this.editor.layout();
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

	zoom(zoomFactor: number): void {
		const zoomLevel = Math.round((zoomFactor - 1) / 0.1);
		monaco.editor.EditorZoom.setZoomLevel(zoomLevel);
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

	getCursorState(): CursorState {
		return this.cursorState;
	}

	getCurrentWord(): string | undefined {
		const position = this.editor.getPosition();
		if (position === null)
			return undefined;
		return this.editor.getModel()?.getWordAtPosition(position)?.word;
	}

	getPreviousWord(): string | undefined {
		const currentPosition = this.editor.getPosition();
		if (currentPosition == null)
			return undefined;

		const currentWord = this.editor.getModel()?.getWordAtPosition(currentPosition);
		if (!currentWord || currentWord.startColumn === 0)
			return undefined;

		const word = this.editor.getModel()?.getWordAtPosition({ lineNumber: currentPosition.lineNumber, column: currentWord.startColumn - 1 });
		return !word ? undefined : word.word;
	}

	addChangeListener(listener: () => void): monaco.IDisposable {
		return this.editor.onDidChangeModelContent(e => listener());
	}

	addLibrary(library: ILibrary): void {
		this.register(addLibrary(library));
	}

	addTemplates(templates: ITemplate[]): void {
		const model = this.editor.getModel();
		if (model === null)
			return;
		this.register(addTemplates(model.getLanguageId(), templates));
	}

	override dispose(): void {
		super.dispose();
		this.editor.getModel()?.dispose();
		this.editor.dispose();
	}
}
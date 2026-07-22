import { Disposable } from "./common/disposable.js";

export class CodeEditorTextInput extends Disposable {
	private readonly onDidChangeTextEmitter = this.register(new monaco.Emitter<string>());
	private readonly onDidPressEnterEmitter = this.register(new monaco.Emitter<string>());

	private readonly iconDecoration: monaco.editor.IEditorDecorationsCollection;

	/**
	 * Creates a monaco based one-line text input in `element` and optionally sets the initial `text`, a `placeholder` text, and an `icon`.
	 * @param icon See https://code.visualstudio.com/api/references/icons-in-labels#icon-listing for valid values.
	 */
	static create(element: HTMLElement, text?: string, placeholder?: string, icon?: string, useMonospaceFont = false): CodeEditorTextInput {
		return new CodeEditorTextInput(monaco.editor.create(element, {
			automaticLayout: true,
			contextmenu: false,
			cursorStyle: "line-thin",
			fixedOverflowWidgets: true,
			folding: false,
			fontFamily: useMonospaceFont ? undefined : `-apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", system-ui, "Ubuntu", "Droid Sans", sans-serif`,
			fontLigatures: true,
			fontSize: 13,
			guides: {
				bracketPairs: false,
				bracketPairsHorizontal: false,
				highlightActiveBracketPair: false,
				highlightActiveIndentation: false,
				indentation: false,
			},
			glyphMargin: false,
			language: "plaintext",
			lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
			lineDecorationsWidth: 0,
			lineNumbers: "off",
			links: false,
			matchBrackets: "never",
			minimap: { enabled: false },
			occurrencesHighlight: "off",
			overviewRulerLanes: 0,
			overviewRulerBorder: false,
			placeholder: placeholder,
			renderLineHighlight: "none",
			roundedSelection: false,
			scrollBeyondLastColumn: 0,
			scrollbar: {
				horizontal: "hidden",
				vertical: "hidden",
				alwaysConsumeMouseWheel: false,
			},
			stickyScroll: {
				enabled: false,
			},
			value: text,
			wordBasedSuggestions: "off",
			wordWrap: "off",
		}), icon);
	}

	private constructor(public readonly monacoEditor: monaco.editor.IStandaloneCodeEditor, private icon?: string) {
		super();
		this.iconDecoration = monacoEditor.createDecorationsCollection();

		const container = monacoEditor.getContainerDomNode();
		container.className = "monaco-single-line";
		const updateHeights = () => {
			const defaultCodiconSize = 16;
			const defaultLineHeight = 18;
			const lineHeight = monacoEditor.getOption(monaco.editor.EditorOption.lineHeight);

			// Set height of parent container.
			container.style.height = `${lineHeight}px`;

			// Set font-size of codicon icons in the glyph margin because otherwise they would keep their default.
			// Since adjusting the container height seems to destroy and recreate the DOM elements in the glyph we
			// wait for the next animation frame.
			requestAnimationFrame(() => {
				for (const iconElement of container.querySelectorAll<HTMLDivElement>(".monaco-single-line-icon"))
					iconElement.style.fontSize = `${Math.floor(defaultCodiconSize * monacoEditor.getOption(monaco.editor.EditorOption.lineHeight) / defaultLineHeight)}px`;
			});
		};
		updateHeights();
		this.register(monaco.editor.EditorZoom.onDidChangeZoomLevel(() => updateHeights()));
		this.register(monacoEditor.onDidFocusEditorWidget(() => container.classList.add("focus")));
		this.register(monacoEditor.onDidBlurEditorWidget(() => container.classList.remove("focus")));

		this.updateIconDecoration();

		this.register(monacoEditor.onKeyDown(e => {
			// prevent editor from handling the tab key and inputting a tab character and delegate to browser instead,
			// but allow using tab to commit a suggestion
			if (e.equals(monaco.KeyCode.Tab) || e.equals(monaco.KeyMod.Shift | monaco.KeyCode.Tab)) {
				if (!(monacoEditor as IStandaloneCodeEditorWithContextKeyService)._contextKeyService?.getContextKeyValue?.("suggestWidgetVisible", e.target) ||
					!(monacoEditor as IStandaloneCodeEditorWithContextKeyService)._contextKeyService?.getContextKeyValue?.("suggestWidgetHasFocusedSuggestion", e.target))
				{
					e.stopPropagation();
				}
			}

			// disable command palette
			if (e.equals(monaco.KeyCode.F1))
				e.stopPropagation();

			// disable find (Ctrl+F on Windows, Cmd+F on Mac) and replace (Ctrl+H on Windows, Cmd+Alt+F on Mac) widgets
			if (e.equals(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF) || e.equals(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH) || e.equals(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyF))
				e.stopPropagation();
		}));

		// suppress enter key and invoke a custom action if registered; use an action so we can have a precondition
		this.register(monacoEditor.addAction({
			id: "hijackEnter",
			label: "",
			keybindings: [monaco.KeyCode.Enter],
			run: () => this.onDidPressEnterEmitter.fire(this.getText()),
			precondition: "!suggestWidgetVisible || !suggestWidgetHasFocusedSuggestion",
		}));
		this.register(monacoEditor.addAction({
			id: "hijackCtrlOrShiftEnter",
			label: "",
			keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, monaco.KeyMod.Shift | monaco.KeyCode.Enter],
			run: () => { }, // do nothing here
			precondition: "editorTextFocus && !editorReadonly",
		}));

		// when pasting multi-line content merge lines into one line
		this.register(monacoEditor.onDidPaste(e => {
			if (e.range.endLineNumber <= 1)
				return;
			this.monacoEditor.popUndoStop(); // remove undo stop introduced by paste operation that contains multiline text
			this.setText(this.getText()); // setText removes line breaks
		}));

		this.register(monacoEditor.onDidChangeModelContent(() => {
			const text = this.getText();
			if (/\r?\n/.test(text))
				return; // do not trigger event for multiline text because it is normalized in the next step and the event fires again with the normalized text
			return this.onDidChangeTextEmitter.fire(text);
		}));
	}

	readonly onDidChangeText = this.onDidChangeTextEmitter.event;
	readonly onDidPressEnter = this.onDidPressEnterEmitter.event;

	get length(): number {
		return this.monacoEditor.getModel()?.getValueLength() ?? 0;
	}

	getText(): string {
		return this.monacoEditor.getValue();
	}

	setText(text: string): void {
		const model = this.monacoEditor.getModel();
		if (!model)
			return;

		const normalizedText = text.replaceAll(/\r?\n/g, " ");
		this.monacoEditor.executeEdits(null, [{ range: model.getFullModelRange(), text: normalizedText }]);
		// set cursor to end
		this.monacoEditor.setPosition({ lineNumber: 1, column: model.getLineMaxColumn(1) });
	}

	focus(): void {
		this.monacoEditor.focus();
	}

	setDisabled(value: boolean): void {
		const container = this.monacoEditor.getContainerDomNode();
		if (value) {
			container.setAttribute("aria-disabled", "true");
		} else {
			container.setAttribute("aria-disabled", "false");
		}
		const editorNode = this.monacoEditor.getDomNode();
		if (editorNode) {
			editorNode.inert = value;
		}
	}

	setReadonly(value: boolean): void {
		this.monacoEditor.updateOptions({ readOnly: value });
	}

	isReadonly(): boolean {
		return this.monacoEditor.getOptions().get(monaco.editor.EditorOption.readOnly);
	}

	/**
	 * Sets the icon that is shown in the decorations gutter to the one passed in `icon`, or removes the icon completely if `undefined` is passed.
	 * @param icon See https://code.visualstudio.com/api/references/icons-in-labels#icon-listing for valid values.
	 */
	setIcon(icon: string | undefined): void {
		this.icon = icon;
		this.updateIconDecoration();
	}

	override dispose(): void {
		super.dispose();
		this.monacoEditor.dispose();
	}

	private updateIconDecoration(): void {
		if (this.icon) {
			this.monacoEditor.updateOptions({ glyphMargin: true, lineDecorationsWidth: 10 });
			this.iconDecoration.set([{
				range: new monaco.Range(1, 1, 1, 1),
				options: { glyphMarginClassName: `monaco-single-line-icon codicon-${this.icon}`, },
			}]);
		} else {
			this.monacoEditor.updateOptions({ glyphMargin: false, lineDecorationsWidth: 0 });
			this.iconDecoration.clear();
		}
	}
}

/** CAUTION: Internal unofficial API */
interface IStandaloneCodeEditorWithContextKeyService extends monaco.editor.IStandaloneCodeEditor {
	/** CAUTION: Internal unofficial API (see IEncodedLineTokens in monaco.d.ts) */
	_contextKeyService: IContextKeyService;
}

/** CAUTION: Internal unofficial API (see IEncodedLineTokens in monaco.d.ts) */
interface IContextKeyService {
	/** CAUTION: Internal unofficial API (see IEncodedLineTokens in monaco.d.ts) */
	getContextKeyValue(contextKey: string, target: HTMLElement): boolean;
}
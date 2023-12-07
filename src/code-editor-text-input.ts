import { Disposable } from "./common/disposable.js";

export class CodeEditorTextInput extends Disposable {
	private readonly onDidChangeTextEmitter = new monaco.Emitter<string>();
	private readonly onDidPressEnterEmitter = new monaco.Emitter<string>();

	private readonly placeholderDecoration = this.editor.createDecorationsCollection();
	private readonly iconDecoration = this.editor.createDecorationsCollection();

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
			lightbulb: { enabled: false },
			lineDecorationsWidth: 0,
			lineNumbers: "off",
			links: false,
			matchBrackets: "never",
			minimap: { enabled: false },
			occurrencesHighlight: "off",
			overviewRulerLanes: 0,
			overviewRulerBorder: false,
			renderLineHighlight: "none",
			roundedSelection: false,
			scrollBeyondLastColumn: 0,
			scrollbar: {
				horizontal: "hidden",
				vertical: "hidden",
				alwaysConsumeMouseWheel: false,
			},
			value: text,
			wordBasedSuggestions: "off",
			wordWrap: "off",
		}), placeholder, icon);
	}

	private constructor(public readonly editor: monaco.editor.IStandaloneCodeEditor, private placeholder?: string, private icon?: string) {
		super();

		const container = editor.getContainerDomNode();
		container.className = "monaco-single-line";
		const updateHeights = () => {
			const defaultCodiconSize = 16;
			const defaultLineHeight = 18;
			const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);

			// Set height of parent container.
			container.style.height = `${lineHeight}px`;

			// Set font-size of codicon icons in the glyph margin because otherwise they would keep their default.
			// Since adjusting the container height seems to destroy and recreate the DOM elements in the glyph we
			// wait for the next animation frame.
			requestAnimationFrame(() => {
				for (const iconElement of container.querySelectorAll<HTMLDivElement>(".monaco-single-line-icon"))
					iconElement.style.fontSize = `${Math.floor(defaultCodiconSize * editor.getOption(monaco.editor.EditorOption.lineHeight) / defaultLineHeight)}px`;
			});
		};
		updateHeights();
		this.register(monaco.editor.EditorZoom.onDidChangeZoomLevel(() => updateHeights()));
		this.register(editor.onDidFocusEditorWidget(() => container.classList.add("focus")));
		this.register(editor.onDidBlurEditorWidget(() => container.classList.remove("focus")));

		this.updatePlaceholderDecoration();
		this.updateIconDecoration();
		this.register(editor.onDidChangeModelContent(() => this.updatePlaceholderDecoration()));

		this.register(editor.onKeyDown(e => {
			// prevent editor from handling the tab key and inputting a tab character
			if (e.equals(monaco.KeyCode.Tab) || e.equals(monaco.KeyMod.Shift | monaco.KeyCode.Tab))
				e.stopPropagation();

			// disable command palette
			if (e.equals(monaco.KeyCode.F1))
				e.stopPropagation();

			// disable find (Ctrl+F on Windows, Cmd+F on Mac) and replace (Ctrl+H on Windows, Cmd+Alt+F on Mac) widgets
			if (e.equals(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF) || e.equals(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH) || e.equals(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyF))
				e.stopPropagation();
		}));

		// suppress enter key and invoke a custom action if registered; use an action so we can have a precondition
		this.register(editor.addAction({
			id: "hijackEnter",
			label: "",
			keybindings: [monaco.KeyCode.Enter],
			run: () => this.onDidPressEnterEmitter.fire(this.getText()),
			precondition: "!suggestWidgetVisible || !suggestWidgetHasFocusedSuggestion",
		}));

		// when pasting multi-line content merge lines into one line
		this.register(editor.onDidPaste(e => {
			if (e.range.endLineNumber <= 1)
				return;
			this.editor.popUndoStop(); // remove undo stop introduced by paste operation that contains multiline text
			this.setText(this.getText()); // setText removes line breaks
		}));

		this.register(editor.onDidChangeModelContent(() => {
			const text = this.getText();
			if (/\r?\n/.test(text))
				return; // do not trigger event for multiline text because it is normalized in the next step and the event fires again with the normalized text
			return this.onDidChangeTextEmitter.fire(text);
		}));
	}

	readonly onDidChangeText = this.onDidChangeTextEmitter.event;
	readonly onDidPressEnter = this.onDidPressEnterEmitter.event;

	get length(): number {
		return this.editor.getModel()?.getValueLength() ?? 0;
	}

	getText(): string {
		return this.editor.getValue();
	}

	setText(text: string): void {
		const model = this.editor.getModel();
		if (!model)
			return;

		const normalizedText = text.replaceAll(/\r?\n/g, " ");
		this.editor.executeEdits(null, [{ range: model.getFullModelRange(), text: normalizedText }]);
		// set cursor to end
		this.editor.setPosition({ lineNumber: 1, column: model.getLineMaxColumn(1) });
	}

	focus(): void {
		this.editor.focus();
	}

	setReadonly(value: boolean): void {
		this.editor.updateOptions({ readOnly: value });
	}

	isReadonly(): boolean {
		return this.editor.getOptions().get(monaco.editor.EditorOption.readOnly);
	}

	setPlaceholder(placeholder: string | undefined): void {
		this.placeholder = placeholder;
		this.updatePlaceholderDecoration();
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
		this.onDidChangeTextEmitter.dispose();
		this.onDidPressEnterEmitter.dispose();
		this.editor.dispose();
	}

	private updatePlaceholderDecoration(): void {
		if (this.placeholder && this.length === 0) {
			this.placeholderDecoration.set([{
				range: new monaco.Range(1, 1, 1, 1),
				options: {
					before: {
						content: this.placeholder,
						inlineClassName: "monaco-single-line-placeholder",
						cursorStops: monaco.editor.InjectedTextCursorStops.None
					},
					showIfCollapsed: true,
				},
			}]);
		} else {
			this.placeholderDecoration.clear();
		}
	}

	private updateIconDecoration(): void {
		if (this.icon) {
			this.editor.updateOptions({ glyphMargin: true, lineDecorationsWidth: 10 });
			this.iconDecoration.set([{
				range: new monaco.Range(1, 1, 1, 1),
				options: { glyphMarginClassName: `monaco-single-line-icon codicon-${this.icon}`, },
			}]);
		} else {
			this.editor.updateOptions({ glyphMargin: false, lineDecorationsWidth: 0 });
			this.iconDecoration.clear();
		}
	}
}
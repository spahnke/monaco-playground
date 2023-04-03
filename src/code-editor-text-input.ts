import { Disposable } from "./common/disposable.js";

export class CodeEditorTextInput extends Disposable {
	private readonly onDidChangeTextEmitter = new monaco.Emitter<string>();
	private readonly onDidPressEnterEmitter = new monaco.Emitter<string>();

	static create(element: HTMLElement, text?: string, placeholder?: string, icon?: string, useMonospaceFont = false): CodeEditorTextInput {
		const hasIcon = Boolean(icon);
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
			glyphMargin: hasIcon,
			language: "plaintext",
			lightbulb: { enabled: false },
			lineDecorationsWidth: hasIcon ? 10 : 0,
			lineNumbers: "off",
			links: false,
			matchBrackets: "never",
			minimap: { enabled: false },
			occurrencesHighlight: false,
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
			wordBasedSuggestions: false,
			wordWrap: "off",
		}), placeholder, icon);
	}

	private constructor(public readonly editor: monaco.editor.IStandaloneCodeEditor, placeholder?: string, icon?: string) {
		super();

		const container = editor.getContainerDomNode();
		container.className = "monaco-single-line";
		container.style.height = `${editor.getOption(monaco.editor.EditorOption.lineHeight)}px`;
		this.register(editor.onDidFocusEditorWidget(() => container.classList.add("focus")));
		this.register(editor.onDidBlurEditorWidget(() => container.classList.remove("focus")));

		if (placeholder) {
			const placeHolderDecorations = editor.createDecorationsCollection();
			const updatePlaceHolderDecorations = () => {
				const length = editor.getModel()?.getValueLength() ?? 0;
				if (length === 0) {
					placeHolderDecorations.set([{
						range: new monaco.Range(1, 1, 1, 1),
						options: {
							before: {
								content: placeholder,
								inlineClassName: "monaco-single-line-placeholder",
								cursorStops: monaco.editor.InjectedTextCursorStops.None
							},
							showIfCollapsed: true,
						},
					}]);
				}
				else {
					placeHolderDecorations.clear();
				}
			};
			updatePlaceHolderDecorations();
			this.register(editor.onDidChangeModelContent(updatePlaceHolderDecorations));
		}

		if (icon) {
			editor.createDecorationsCollection([
				{
					range: new monaco.Range(1, 1, 1, 1),
					options: { glyphMarginClassName: `codicon-${icon}`, },
				}
			]);
		}

		this.register(editor.onKeyDown(e => {
			// prevent editor from handling the tab key and inputting a tab character
			if (e.equals(monaco.KeyCode.Tab) || e.equals(monaco.KeyMod.Shift | monaco.KeyCode.Tab))
				e.stopPropagation();

			// disable command palette
			if (e.equals(monaco.KeyCode.F1))
				e.stopPropagation();

			// disable find widget
			if (e.equals(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF))
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

	override dispose(): void {
		super.dispose();
		this.onDidChangeTextEmitter.dispose();
		this.onDidPressEnterEmitter.dispose();
		this.editor.dispose();
	}
}
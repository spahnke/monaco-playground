import { Disposable } from "./common/disposable.js";
import { loadMonaco } from "./monaco-loader.js";

export class CodeEditorTextInput extends Disposable {
	static async create(element: HTMLElement, placeholder?: string, language?: string, useMonospaceFont = false): Promise<CodeEditorTextInput> {
		await loadMonaco();
		return new CodeEditorTextInput(monaco.editor.create(element, {
			automaticLayout: true,
			contextmenu: false,
			cursorStyle: "line-thin",
			fixedOverflowWidgets: true,
			folding: false,
			fontFamily: useMonospaceFont ? undefined : `-apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", system-ui, "Ubuntu", "Droid Sans", sans-serif`,
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
			roundedSelection: false,
			scrollBeyondLastColumn: 0,
			scrollbar: {
				horizontal: "hidden",
				vertical: "hidden",
				alwaysConsumeMouseWheel: false,
			},
			wordBasedSuggestions: false,
			wordWrap: "off",
		}), placeholder);
	}

	private constructor(public readonly editor: monaco.editor.IStandaloneCodeEditor, placeholder?: string) {
		super();

		const container = editor.getContainerDomNode();
		container.className = "monaco-single-line";
		container.style.height = `${editor.getOption(monaco.editor.EditorOption.lineHeight)}px`;
		this.register(editor.onDidFocusEditorWidget(() => container.classList.add("focus")));
		this.register(editor.onDidBlurEditorWidget(() => container.classList.remove("focus")));

		if (placeholder) {
			const placeholderDecoration: monaco.editor.IModelDeltaDecoration = {
				options: {
					before: {
						content: placeholder,
						inlineClassName: "monaco-single-line-placeholder",
						cursorStops: monaco.editor.InjectedTextCursorStops.None
					},
					isWholeLine: true,
					showIfCollapsed: true,
				},
				range: new monaco.Range(1, 1, 1, 1),
			};
			const decorations = editor.createDecorationsCollection([placeholderDecoration]);
			this.register(editor.onDidChangeModelContent(() => {
				const length = editor.getModel()?.getValueLength() ?? 0;
				if (length === 0)
					decorations.set([placeholderDecoration]);
				else
					decorations.clear();
			}));
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
			run: editor => this.onEnter?.(editor.getValue()),
			precondition: "!suggestWidgetVisible",
		}));

		// when pasting multi-line content merge lines into one line
		this.register(editor.onDidPaste(e => {
			if (e.range.endLineNumber <= 1)
				return;
			const text = this.getText();
			this.setText(text.replaceAll(/\r?\n/g, " "));
		}));
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
		this.editor.updateOptions({ readOnly: value });
	}

	isReadonly(): boolean {
		return this.editor.getOptions().get(monaco.editor.EditorOption.readOnly);
	}

	override dispose(): void {
		super.dispose();
		this.editor.dispose();
	}
}
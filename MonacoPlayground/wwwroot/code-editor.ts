export class CodeEditor {
	private editor: monaco.editor.IStandaloneCodeEditor;
	private zoomFactor: number = 1;
	private whitespaceVisible: boolean = false;

	static create(element: HTMLElement): Promise<CodeEditor> {
		return new Promise(resolve => {
			(<any>window).require.config({ paths: { vs: "monaco/min/vs" } });
			(<any>window).require(["vs/editor/editor.main"], () => {
				resolve(new CodeEditor(monaco.editor.create(element, {
					theme: "vs",
					mouseWheelZoom: true,
					automaticLayout: true,
				})));
			});
		});
	}

	private constructor(editor: monaco.editor.IStandaloneCodeEditor) {
		this.editor = editor;
		this.configureJavascriptSettings();
		this.addCommands();
		console.log("editor", this);
	}

	setContents(content: string, language?: string, fileName?: string) {
		const uri = monaco.Uri.parse(fileName || "app.js");
		const model = monaco.editor.createModel(content, language || "javascript", uri);
		this.editor.setModel(model);
	}

	getText(): string {
		return this.editor.getValue();
	}

	focus() {
		this.editor.focus();
	}

	setReadonly(value: boolean) {
		this.editor.updateOptions({ readOnly: value });
	}

	isReadonly(): boolean {
		return this.editor.getConfiguration().readOnly;
	}

	getSelectedText(): string {
		return this.editor.getModel().getValueInRange(this.editor.getSelection());
	}

	replaceSelectedText(newText: string) {
		if (newText !== null)
			this.editor.executeEdits("replace", [{ range: this.editor.getSelection(), text: newText }]);
	}

	getLine(): number {
		return this.editor.getPosition().lineNumber;
	}

	gotoLine(line: number) {
		this.editor.setPosition({
			lineNumber: line,
			column: 1
		});
	}

	getOffset(): number {
		return this.editor.getModel().getOffsetAt(this.editor.getPosition());
	}

	gotoOffset(offset: number) {
		this.editor.setPosition(this.editor.getModel().getPositionAt(offset));
	}

	zoom(zoomFactor: number) {
		if (zoomFactor < 0.69 || zoomFactor > 3.01)
			return;

		this.zoomFactor = zoomFactor;
		this.editor.updateOptions({ fontSize: 14 * this.zoomFactor })
	}

	zoomIn() {
		this.zoom(this.zoomFactor + 0.1);
	}

	zoomOut() {
		this.zoom(this.zoomFactor - 0.1);
	}

	// reset of zoom does not work atm when using mouse wheel zoom simultaniously (cf. https://github.com/Microsoft/monaco-editor/issues/196)
	resetZoom() {
		this.zoom(1);
	}

	//zoomIn() {
	//	this.editor.trigger("zoom", "editor.action.fontZoomIn", null);
	//}

	//zoomOut() {
	//	this.editor.trigger("zoom", "editor.action.fontZoomOut", null);
	//}

	//resetZoom() {
	//	this.editor.trigger("zoom", "editor.action.fontZoomReset", null);
	//}

	format() {
		this.editor.trigger("format", "editor.action.formatDocument", null);
	}

	toggleWhitespaces() {
		this.whitespaceVisible = !this.whitespaceVisible;
		this.editor.updateOptions({ renderWhitespace: this.whitespaceVisible ? "boundary" : "none" });
	}

	getCurrentWord(): string {
		const word = this.editor.getModel().getWordAtPosition(this.editor.getPosition());
		return word === null ? null : word.word;
	}

	destroy() {
		this.editor.dispose();
	}

	private configureJavascriptSettings() {
		// validation settings
		monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
			noSemanticValidation: false,
			noSyntaxValidation: false,
		});

		// compiler options
		monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
			target: monaco.languages.typescript.ScriptTarget.ES2018,
			checkJs: true,
			allowJs: true,
			allowNonTsExtensions: true, // not documented in the typings but important to get syntax/semantic validation working
		});

		const libraries: ILibrary[] = [
			{
				contents: `
declare class Facts {
	/**
	 * Returns the next fact
	 * 
	 * [Online documentation](http://www.google.de)
	 */
	static next(): string;
}`,
				language: "typescript",
				filePath: "test.d.ts"
			},
			{
				contents: "var baz = 42",
				language: "javascript",
				filePath: "baz.js"
			}
		];

		for (const library of libraries) {
			// TODO should make peek/goto definition work but leads to an error
			monaco.languages.typescript.javascriptDefaults.addExtraLib(library.contents, library.filePath);
			monaco.editor.createModel(library.contents, library.language, monaco.Uri.parse(library.filePath));
		}
	}

	private addCommands() {
		this.editor.addCommand(monaco.KeyCode.US_EQUAL | monaco.KeyMod.CtrlCmd, () => this.zoomIn(), null);
		this.editor.addCommand(monaco.KeyCode.US_MINUS | monaco.KeyMod.CtrlCmd, () => this.zoomOut(), null);
		this.editor.addCommand(monaco.KeyCode.KEY_0 | monaco.KeyMod.CtrlCmd, () => this.resetZoom(), null);
	}
}

interface ILibrary {
	contents: string;
	language: string;
	filePath: string;
}
export class CodeEditor {
	private editor: monaco.editor.IStandaloneCodeEditor;
	private resources: monaco.IDisposable[] = [];
	private zoomFactor: number = 1;
	private whitespaceVisible: boolean = false;

	static create(element: HTMLElement, language?: string): Promise<CodeEditor> {
		return new Promise(resolve => {
			(<any>window).require.config({ paths: { vs: "lib/monaco/min/vs" } });
			(<any>window).require(["vs/editor/editor.main"], () => {
				resolve(new CodeEditor(monaco.editor.create(element, {
					language: language,
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
		this.disposeModel();
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

	addChangeListener(listener: () => void) {
		this.editor.onDidChangeModelContent(e => listener());
	}

	addLibrary(library: ILibrary) {
		// TODO should make peek/goto definition work but leads to an error
		this.resources.push(monaco.languages.typescript.javascriptDefaults.addExtraLib(library.contents, library.filePath));
		this.resources.push(monaco.editor.createModel(library.contents, library.language, monaco.Uri.parse(library.filePath)));
	}

	destroy() {
		for (const resource of this.resources)
			resource.dispose();
		this.disposeModel();
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
			alwaysStrict: true,
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

		for (const library of libraries)
			this.addLibrary(library);
	}

	private addCommands() {
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_EQUAL, () => this.zoomIn(), null);
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_MINUS, () => this.zoomOut(), null);
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_0, () => this.resetZoom(), null);
		this.editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_W, () => this.toggleWhitespaces(), null);
	}

	private disposeModel() {
		const currentModel = this.editor.getModel();
		if (currentModel)
			currentModel.dispose();
	}
}

interface ILibrary {
	contents: string;
	language: string;
	filePath: string;
}
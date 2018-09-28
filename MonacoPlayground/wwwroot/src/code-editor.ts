import { esnext } from "./lib.js";
import { LinqLanguageProvider } from "./languages/linq.js";
import { Linter } from "./linter/linter.js";

export class CodeEditor {
	public editor: monaco.editor.IStandaloneCodeEditor;
	private resources: monaco.IDisposable[] = [];
	private zoomFactor: number = 1;
	private whitespaceVisible: boolean = false;

	static create(element: HTMLElement, language?: string): Promise<CodeEditor> {
		return new Promise(resolve => {
			(<any>window).require.config({ paths: { vs: "lib/monaco/min/vs" } });
			(<any>window).require(["vs/editor/editor.main"], () => {
				LinqLanguageProvider.register();
				resolve(new CodeEditor(monaco.editor.create(element, {
					language: language,
					fontSize: 12,
					theme: "vs",
					mouseWheelZoom: false,
					automaticLayout: true,
					showUnused: true,
					lightbulb: { enabled: true }
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
		this.editor.setPosition({ lineNumber: line, column: 1 });
		this.editor.revealLineInCenterIfOutsideViewport(line);
	}

	getOffset(): number {
		return this.editor.getModel().getOffsetAt(this.editor.getPosition());
	}

	gotoOffset(offset: number) {
		const position = this.editor.getModel().getPositionAt(offset);
		this.editor.setPosition(position);
		this.editor.revealPositionInCenterIfOutsideViewport(position);
	}

	zoom(zoomFactor: number) {
		if (zoomFactor < 0.69 || zoomFactor > 3.01)
			return;

		this.zoomFactor = zoomFactor;
		this.editor.updateOptions({ fontSize: 12 * this.zoomFactor })
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

	getCurrentWord(): string | null {
		const word = this.editor.getModel().getWordAtPosition(this.editor.getPosition());
		return word === null ? null : word.word;
	}

	addChangeListener(listener: () => void) {
		this.editor.onDidChangeModelContent(e => listener());
	}

	addLibrary(library: ILibrary) {
		// TODO should make peek/goto definition work but leads to an error
		if (library.filePath.endsWith("d.ts"))
			this.resources.push(monaco.languages.typescript.javascriptDefaults.addExtraLib(library.contents, library.filePath));
		this.resources.push(monaco.editor.createModel(library.contents, library.language, monaco.Uri.parse(library.filePath)));
	}

	async getJavaScriptWorker(): Promise<any> {
		if (this.editor.getModel().getModeId() !== "javascript")
			throw new Error("Only available for JavaScript documents.")
		const worker = await monaco.languages.typescript.getJavaScriptWorker();
		return await worker(this.editor.getModel().uri);
	}

	setLinter(linter: Linter) {
		if (this.editor.getModel().getModeId() !== linter.getLanguage())
			return;

		this.resources.push(this.editor.onDidChangeModel(e => this.performLinting(linter)));
		this.resources.push(this.editor.onDidChangeModelContent(e => this.performLinting(linter)));

		if (linter.providesCodeFixes())
			this.resources.push(monaco.languages.registerCodeActionProvider(linter.getLanguage(), linter));

		this.resources.push(linter);
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
			target: monaco.languages.typescript.ScriptTarget.ESNext,
			lib: [],
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
				contents: esnext,
				language: "typescript",
				filePath: "lib.esnext.d.ts"
			},
		];

		for (const library of libraries)
			this.addLibrary(library);
	}

	private addCommands() {
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_EQUAL, () => this.zoomIn(), "");
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_MINUS, () => this.zoomOut(), "");
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_0, () => this.resetZoom(), "");
		this.editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_W, () => this.toggleWhitespaces(), "");
	}

	private async performLinting(linter: Linter) {
		const model = this.editor.getModel();
		if (!model || model.getModeId() !== linter.getLanguage())
			return;

		const diagnostics = await linter.lint(this.getText());
		if (diagnostics === null)
			return;

		monaco.editor.setModelMarkers(model, "linter", diagnostics.map(x => x.marker));
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
import { esnext } from "./lib.js";
import { LinqLanguageProvider } from "./languages/linq.js";
import { Linter } from "./linter/linter.js";

export class CodeEditor {
	public editor: monaco.editor.IStandaloneCodeEditor;
	private resources: monaco.IDisposable[] = [];
	private zoomFactor: number = 1;
	private whitespaceVisible: boolean = false;

	static create(element: HTMLElement, language?: string, allowTopLevelReturn: boolean = false): Promise<CodeEditor> {
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
				}), allowTopLevelReturn));
			});
		});
	}

	private constructor(editor: monaco.editor.IStandaloneCodeEditor, allowTopLevelReturn: boolean = false) {
		this.editor = editor;
		this.configureJavascriptSettings();
		this.addCommands();
		if (allowTopLevelReturn)
			this.allowTopLevelReturn();
		console.log("editor", this);
	}

	setContents(content: string, language?: string, fileName?: string) {
		this.disposeModel();
		const uri = monaco.Uri.file(fileName || "app.js");
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

	getSelectedText(): string | null {
		const model = this.editor.getModel();
		const selection = this.editor.getSelection();
		if (model === null || selection === null)
			return null;
		return model.getValueInRange(selection);
	}

	replaceSelectedText(newText: string) {
		const selection = this.editor.getSelection();
		if (newText !== null && selection !== null)
			this.editor.executeEdits("replace", [{ range: selection, text: newText }]);
	}

	getLine(): number | null {
		const position = this.editor.getPosition();
		if (position === null)
			return null;
		return position.lineNumber;
	}

	gotoLine(line: number) {
		this.editor.setPosition({ lineNumber: line, column: 1 });
		this.editor.revealLineInCenterIfOutsideViewport(line);
	}

	getOffset(): number | null {
		const model = this.editor.getModel();
		const position = this.editor.getPosition();
		if (model === null || position === null)
			return null;
		return model.getOffsetAt(position);
	}

	gotoOffset(offset: number) {
		const model = this.editor.getModel();
		if (model === null)
			return;
		const position = model.getPositionAt(offset);
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
		const model = this.editor.getModel();
		const position = this.editor.getPosition();
		if (model === null || position === null)
			return null;
		const word = model.getWordAtPosition(position);
		return word === null ? null : word.word;
	}

	addChangeListener(listener: () => void) {
		this.editor.onDidChangeModelContent(e => listener());
	}

	addLibrary(library: ILibrary) {
		const uri = monaco.Uri.file(library.filePath);
		// TODO should make peek/goto definition work but leads to an error
		if (library.filePath.endsWith("d.ts"))
			this.resources.push(monaco.languages.typescript.javascriptDefaults.addExtraLib(library.contents, uri.toString()));
		this.resources.push(monaco.editor.createModel(library.contents, library.language, uri));
	}

	async getJavaScriptWorker(): Promise<any> {
		const model = this.editor.getModel();
		if (model === null || model.getModeId() !== "javascript")
			throw new Error("Only available for JavaScript documents.")
		const worker = await monaco.languages.typescript.getJavaScriptWorker();
		return await worker(model.uri);
	}

	setLinter(linter: Linter) {
		const model = this.editor.getModel();
		if (model === null || model.getModeId() !== linter.getLanguage())
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

	private allowTopLevelReturn() {
		const model = this.editor.getModel();
		if (model === null || model.getModeId() !== "javascript")
			throw new Error("Only available for JavaScript documents.");

		// there is not option in TypeScript to allow top level return statements
		// so we listen to changes to decorations and filter the marker list
		// (see https://github.com/Microsoft/monaco-editor/issues/1069)
		this.resources.push(this.editor.onDidChangeModelDecorations(() => {
			const model = this.editor.getModel();
			if (model === null || model.getModeId() !== "javascript")
				return;

			const owner = model.getModeId();
			const markers = monaco.editor
				.getModelMarkers({ owner })
				.filter(x => x.message !== "A 'return' statement can only be used within a function body.");
			monaco.editor.setModelMarkers(model, owner, markers);
		}));
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

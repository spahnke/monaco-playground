import { registerLanguages } from "./languages/language-registry.js";
import { ILibrary, addLibrary, doAllowTopLevelReturn } from "./languages/javascript/javascript-extensions.js";
import { dom } from "./languages/javascript/lib.js";

export class CodeEditor {
	public editor: monaco.editor.IStandaloneCodeEditor;
	private resources: monaco.IDisposable[] = [];
	private zoomFactor: number = 1;
	private whitespaceVisible: boolean = false;

	static create(element: HTMLElement, language?: string, allowTopLevelReturn: boolean = false): Promise<CodeEditor> {
		return new Promise(resolve => {
			(<any>window).require.config({ paths: { vs: "lib/monaco/dev/vs" } });
			(<any>window).require(["vs/editor/editor.main"], () => {
				registerLanguages();
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
		this.addCommands();
		if (allowTopLevelReturn)
			this.resources.push(doAllowTopLevelReturn(editor));
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
		this.resources.push(...addLibrary(library));
	}

	enableJavaScriptBrowserCompletion() {
		this.addLibrary({
			contents: dom,
			language: "typescript",
			filePath: "lib.dom.d.ts"
		});
	}

	async getJavaScriptWorker(): Promise<any> {
		const model = this.editor.getModel();
		if (model === null || model.getModeId() !== "javascript")
			throw new Error("Only available for JavaScript documents.")
		const worker = await monaco.languages.typescript.getJavaScriptWorker();
		return await worker(model.uri);
	}

	destroy() {
		for (const resource of this.resources)
			resource.dispose();
		this.disposeModel();
		this.editor.dispose();
	}

	private addCommands() {
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_EQUAL, () => this.zoomIn(), "");
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_MINUS, () => this.zoomOut(), "");
		this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_0, () => this.resetZoom(), "");
		this.editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_W, () => this.toggleWhitespaces(), "");
	}

	private disposeModel() {
		const currentModel = this.editor.getModel();
		if (currentModel)
			currentModel.dispose();
	}
}

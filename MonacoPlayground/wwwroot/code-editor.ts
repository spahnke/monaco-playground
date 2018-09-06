export class CodeEditor {
	private editor: monaco.editor.IStandaloneCodeEditor;
	private zoomFactor: number = 1;
	private whitespaceVisible: boolean = false;

	static create(element: HTMLElement, language: string): Promise<CodeEditor> {
		return new Promise(resolve => {
			require.config({ paths: { vs: "monaco/min/vs" } });
			require(["vs/editor/editor.main"], () => {
				resolve(new CodeEditor(monaco.editor.create(element, {
					language,
					theme: "vs",
					mouseWheelZoom: true
				})));
			});
		});
	}

	private constructor(editor: monaco.editor.IStandaloneCodeEditor) {
		this.editor = editor;
		this.addCommands();
		console.log("monaco", editor);
		console.log("code editor", this);
	}

	setContent(content: string) {
		this.editor.setValue(content);
	}

	getText(): string {
		return this.editor.getValue();
	}

	focus(): boolean {
		if (this.editor) {
			this.editor.focus();
			return true;
		}
		return false;
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

	private addCommands() {
		this.editor.addCommand(monaco.KeyCode.US_EQUAL | monaco.KeyMod.CtrlCmd, () => this.zoomIn(), null);
		this.editor.addCommand(monaco.KeyCode.US_MINUS | monaco.KeyMod.CtrlCmd, () => this.zoomOut(), null);
		this.editor.addCommand(monaco.KeyCode.KEY_0 | monaco.KeyMod.CtrlCmd, () => this.resetZoom(), null);
	}
}




//-----------------------------------------------------------------------------------------
// diff editor:
//const originalModel = monaco.editor.createModel("var foo = 'bar';", "javascript");
//const modifiedModel = monaco.editor.createModel("var test = 42", "javascript");

//const diffEditor = monaco.editor.createDiffEditor(document.querySelector(".diff"), {
//	automaticLayout: true,
//	contextmenu: true,
//	enableSplitViewResizing: false,
//	hover: { enabled: true },
//	ignoreTrimWhitespace: true,
//	originalEditable: true,
//	readOnly: false,
//	theme: "vs"
//});
//diffEditor.setModel({
//	original: originalModel,
//	modified: modifiedModel
//});
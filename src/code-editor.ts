import { doAllowTopLevelReturn } from "./languages/javascript/javascript-extensions.js";
import { dom } from "./languages/javascript/lib.js";
import { registerLanguages } from "./languages/language-registry.js";
import { addLibrary, ILibrary } from "./monaco-helper.js";

export class CodeEditor {
	public editor: monaco.editor.IStandaloneCodeEditor;
	private resources: monaco.IDisposable[] = [];
	private zoomFactor: number = 1;
	private whitespaceVisible: boolean = false;

	static create(element: HTMLElement, language?: string, allowTopLevelReturn: boolean = false): Promise<CodeEditor> {
		return new Promise(resolve => {
			(<any>window).require.config({ paths: { vs: "lib/monaco/dev/vs" } });
			//(<any>window).require.config({
			//	"vs/nls": {
			//		availableLanguages: {
			//			"*": "de"
			//		}
			//	}
			//});
			(<any>window).require(["vs/editor/editor.main"], () => {
				registerLanguages();
				resolve(new CodeEditor(monaco.editor.create(element, {
					automaticLayout: true,
					fixedOverflowWidgets: true,
					fontSize: 12,
					formatOnPaste: true,
					formatOnType: true,
					language,
					lightbulb: { enabled: true },
					minimap: { enabled: true },
					mouseWheelZoom: false, // sync/reset of zoom does not work atm when using builtin mouse wheel zoom simultaniously (cf. https://github.com/Microsoft/monaco-editor/issues/196)
					quickSuggestions: {
						comments: true,
						other: false,
						strings: true,
					},
					renderWhitespace: "selection",
					showUnused: true,
					theme: "vs",
				}), allowTopLevelReturn));
			});
		});
	}

	/**
	 * CAUTION: Uses internal API to get an object of the non-exported class ContextKeyExpr
	 */
	static deserializeContextKeyExpr(context?: string): Promise<any> {
		return new Promise(resolve => {
			(window as any).require(["vs/platform/contextkey/common/contextkey"], (x: any) => {
				resolve(x.ContextKeyExpr.deserialize(context));
			});
		});
	}

	private constructor(editor: monaco.editor.IStandaloneCodeEditor, allowTopLevelReturn: boolean = false) {
		this.editor = editor;
		this.addCommands();
		this.patchExistingKeyBindings();
		if (allowTopLevelReturn)
			this.resources.push(doAllowTopLevelReturn(editor));
		console.log("editor", this);
	}

	setContents(content: string, language?: string, fileName?: string) {
		this.disposeModel();
		const uri = monaco.Uri.file(fileName ?? "app.js");
		const model = monaco.editor.createModel(content, language, uri);
		this.editor.setModel(model);
	}

	appendLine(line?: string) {
		const model = this.editor.getModel();
		if (model === null)
			return;
		model.pushEditOperations(this.editor.getSelections() ?? [], [{
			text: line === undefined ? model.getEOL() : line,
			range: new monaco.Range(model.getLineCount(), 0, model.getLineCount(), 0), // empty range for insert
		}], () => []);
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

	getSelectedText(): string | undefined {
		const selection = this.editor.getSelection();
		if (selection === null)
			return undefined;
		return this.editor.getModel()?.getValueInRange(selection);
	}

	replaceSelectedText(newText: string) {
		const selection = this.editor.getSelection();
		if (newText !== null && selection !== null)
			this.editor.executeEdits("replace", [{ range: selection, text: newText }]);
	}

	getLine(): number | undefined {
		const position = this.editor.getPosition();
		return position?.lineNumber;
	}

	gotoLine(line: number) {
		this.editor.setPosition({ lineNumber: line, column: 1 });
		this.editor.revealLineInCenterIfOutsideViewport(line);
	}

	getOffset(): number | undefined {
		const position = this.editor.getPosition();
		if (position === null)
			return undefined;
		return this.editor.getModel()?.getOffsetAt(position);
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

	getCurrentWord(): string | undefined {
		const position = this.editor.getPosition();
		if (position === null)
			return undefined;
		return this.editor.getModel()?.getWordAtPosition(position)?.word;
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
		this.editor.getModel()?.dispose();
	}

	private patchExistingKeyBindings() {
		this.patchKeyBinding("editor.action.quickFix", monaco.KeyMod.Alt | monaco.KeyCode.Enter); // Default is Ctrl+.
		this.patchKeyBinding("editor.action.quickOutline", monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_O); // Default is Ctrl+Shift+O
		this.patchKeyBinding("editor.action.rename", monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_R)); // Default is F2
	}

	private async patchKeyBinding(id: string, newKeyBinding?: number, context?: string) {
		const action = this.editor.getAction(id);
		(this.editor as any)._standaloneKeybindingService.addDynamicKeybinding(`-${id}`); // remove existing one; no official API yet
		if (newKeyBinding) {
			const when = await CodeEditor.deserializeContextKeyExpr(context);
			(this.editor as any)._standaloneKeybindingService.addDynamicKeybinding(id, newKeyBinding, () => action.run(), when);
		}
	}
}

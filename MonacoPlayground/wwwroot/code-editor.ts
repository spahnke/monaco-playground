export class CodeEditor {
    private editor: monaco.editor.IStandaloneCodeEditor;

	static create(element: HTMLElement, language: string): Promise<CodeEditor> {
		return new Promise(resolve => {
			require.config({ paths: { vs: "monaco/min/vs" } });
			require(["vs/editor/editor.main"], () => {
				resolve(new CodeEditor(monaco.editor.create(element, {
					language,
					theme: "vs"
				})));
			});
		});
	}

	private constructor(editor: monaco.editor.IStandaloneCodeEditor) {
		this.editor = editor;
	}

	setContent(content: string) {
		this.editor.setValue(content);
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
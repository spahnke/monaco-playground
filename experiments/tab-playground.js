// Playground sample for multiple tabs
// We initialize the model language as plaintext and reset it to plaintext on deactivation because
// we want to use multiple independent JavaScript models, i.e. a definition of constant 'foo' in model 1
// should not lead to redeclaration errors in model 2 if the same constant is defined there. For the
// same reason we trigger a language service reset by setting the compiler options again.

/* HTML:

<button id="model1">Model 1</button>
<button id="model2">Model 2</button>
<div id="container" style="height:100%;"></div>

*/

monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
	noSemanticValidation: false,
	noSyntaxValidation: false
});

monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
	target: monaco.languages.typescript.ScriptTarget.ESNext,
	allowNonTsExtensions: true,
	checkJs: true
});

class TextModel {
	constructor(content, language, fileName) {
		this.model = monaco.editor.createModel(content, "plaintext", monaco.Uri.file(fileName));
		this.language = language;
		this.viewState = null;
	}

	bind(editor) {
		monaco.editor.setModelLanguage(this.model, this.language);
		editor.setModel(this.model);
		if (this.viewState)
			editor.restoreViewState(this.viewState);
	}

	unbind(editor) {
		this.viewState = editor.saveViewState();
		monaco.editor.setModelLanguage(this.model, "plaintext");
		// trigger language service reset
		monaco.languages.typescript.javascriptDefaults.setCompilerOptions(monaco.languages.typescript.javascriptDefaults.getCompilerOptions());
	}
}

const model1 = new TextModel("//model 1\nconst foo = 1;", "javascript", "model1.js");
const model2 = new TextModel("//model 2\nconst foo = 1;", "javascript", "model2.js");

const editor = monaco.editor.create(document.getElementById("container"), {
	model: null,
	language: "plaintext"
});

model1.bind(editor);

document.getElementById("model1").addEventListener("click", () => {
	model2.unbind(editor);
	model1.bind(editor);
	editor.focus();
});
document.getElementById("model2").addEventListener("click", () => {
	model1.unbind(editor);
	model2.bind(editor);
	editor.focus();
});
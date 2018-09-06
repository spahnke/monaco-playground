require.config({ paths: { vs: "monaco/min/vs" } });
require(["vs/editor/editor.main"], function () {
	// monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
	// 	target: monaco.languages.typescript.ScriptTarget.ES2017
	// });

	const editor = monaco.editor.create(document.querySelector(".editor"), {
		value: `function x() {
    console.log('Hello world!');
}`,
		language: "javascript",
		theme: "vs"
	});

	const originalModel = monaco.editor.createModel("var foo = 'bar';", "javascript");
	const modifiedModel = monaco.editor.createModel("var test = 42", "javascript");

	const diffEditor = monaco.editor.createDiffEditor(document.querySelector(".diff"), {
		automaticLayout: true,
		contextmenu: true,
		enableSplitViewResizing: false,
		hover: { enabled: true },
		ignoreTrimWhitespace: true,
		originalEditable: true,
		readOnly: false,
		theme: "vs"
	});
	diffEditor.setModel({
		original: originalModel,
		modified: modifiedModel
	});
});

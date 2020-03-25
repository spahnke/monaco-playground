// @ts-nocheck
// We have a bug where the peek definition view shows a blank window but it is not reproducable in the playground
// https://github.com/microsoft/monaco-editor/issues/1884
const lib = `declare class Facts {
	/**
	 * Returns the next fact
	 *
	 * [Online documentation](http://www.google.de)
	 */
	static next(): string;
}`;

const uri = monaco.Uri.file("filename/facts.d.ts");
monaco.languages.typescript.javascriptDefaults.addExtraLib(lib, uri.toString());
monaco.editor.createModel(lib, "typescript", uri);

monaco.editor.create(document.getElementById("container"), {
	value: `class Chuck {
    greet() {
        return Facts.next();
    }
}`,
	language: "javascript",
	automaticLayout: true // this is the culprit
});
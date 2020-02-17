// @ts-nocheck
// We have a bug where the peek definition view shows a blank window but it is not reproducable in the playground

const lib = `declare class Facts {
	/**
	 * Returns the next fact
	 *
	 * [Online documentation](http://www.google.de)
	 */
	static next(): string;
}`;

const libUri = monaco.Uri.file("test.d.ts");
monaco.languages.typescript.javascriptDefaults.addExtraLib(lib, libUri.toString());
monaco.languages.typescript.typescriptDefaults.addExtraLib(lib, libUri.toString());
monaco.editor.createModel(lib, "typescript", libUri);

const editor = monaco.editor.create(document.getElementById("container"), {
    language: undefined
});

editor.getModel()?.dispose();
const uri = monaco.Uri.file("app.js");
const model = monaco.editor.createModel(`class Chuck {
    greet() {
        return Facts.next();
    }
}`, "javascript", uri);
editor.setModel(model);
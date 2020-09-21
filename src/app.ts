import { CodeEditor } from "./code-editor.js";

async function main() {
	const editor = await CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);

	editor.addLibrary({
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
	});

	editor.setContents(`class Foo {
	/**
	 * The class Foo
	 *
	 * [Online documentation](http://www.google.de)
	 */
	constructor() {
		this.bar = 42;
	}
}

const text = 'asdf';
const foo = new Foo();
foo.bar = Facts.next();
linq.execute('a x.id.toString() === "asdf" asdf ');
linq.execute(\`a x.id.toString() === "asdf" asdf \`);
linq.execute(\`a x.id.toString() === "\${text}" asdf \`);
linq.execute('a x.id.toString() === "' + foo + '" asdf ');
`, "javascript");

	// example to intercept links that are opened
	const linkDetector = editor.editor.getContribution("editor.linkDetector") as monaco.editor.ILinkDetector;
	linkDetector.openerService._openers.unshift({
		async open(resource: string | monaco.Uri) {
			if (typeof resource === "string")
				resource = monaco.Uri.parse(resource);
			console.log("Opening: ", resource);
			return false; // was this resource handled?
		}
	});

	// example to intercept go to definition requests
	const editorService = editor.editor._codeEditorService;
	const openEditorBase = editorService.openCodeEditor.bind(editorService);
	editorService.openCodeEditor = async (input: monaco.editor.IResourceEditorInput, source: monaco.editor.ICodeEditor) => {
		const result = await openEditorBase(input, source);
		if (result === null) {
			console.log("Open definition here...", input);
			console.log("Corresponding model: ", monaco.editor.getModel(input.resource));
		}
		return result; // always return the base result
	};
}

main();

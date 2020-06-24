import { CodeEditor } from "./code-editor.js";

async function main() {
	const editor = await CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);
	const opener: monaco.editor.IOpener = {
		async open(resource: string | monaco.Uri) {
			if (typeof resource === "string")
				resource = monaco.Uri.parse(resource);
			console.log("Opening: ", resource);
			return false; // was this resource handled?
		}
	};
	const linkDetector = editor.editor.getContribution("editor.linkDetector") as monaco.editor.ILinkDetector;
	linkDetector.openerService._openers.unshift(opener);

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
}

main();

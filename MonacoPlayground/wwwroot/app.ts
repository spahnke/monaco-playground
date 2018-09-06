import { CodeEditor } from "./code-editor.js";

async function main() {
	const editor = await CodeEditor.create(document.querySelector(".editor"), "javascript");
	editor.setContent(`class Foo {
	/**
	 * The class Foo
	 * 
	 * [Online documentation](http://www.google.de)
	 */
	constructor() {
		this.bar = 42;
	}
}

const foo = new Foo();
foo.bar = Facts.next();`);
}

main();
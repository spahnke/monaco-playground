import { CodeEditor } from "./code-editor.js";
import { EsLint } from "./eslint.js";

async function main() {
	const editor = await CodeEditor.create(document.querySelector(".editor") as HTMLElement);
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

const foo = new Foo();
foo.bar = Facts.next();`);
	
	const config = await fetch("eslintrc.json").then(r => r.json());
	editor.setLinter(new EsLint(config));
}

main();
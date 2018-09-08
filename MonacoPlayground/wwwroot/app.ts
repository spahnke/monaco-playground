import { CodeEditor } from "./code-editor.js";
import { Linter } from "./linter.js";

async function main() {
	const editor = await CodeEditor.create(document.querySelector(".editor"));
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
	const linter = new Linter(config);

	document.querySelector("#lint").addEventListener("click", async () => {
		const result = await linter.lint(editor.getText());
		console.log(result);
	});
}

main();
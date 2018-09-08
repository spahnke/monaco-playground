import { CodeEditor } from "./code-editor.js";
import { Linter } from "./linter.js";

const linter = new Linter();

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
	
	const config = {
		parserOptions: {
			ecmaVersion: 2018,
			ecmaFeatures: {
				impliedStrict: true
			},
		},
		rules: {
			"no-unused-vars": "warn",
			"no-undef": "error",
			"semi": "warn"
		},
		globals: {
			Facts: true,
		}
	};
	
	document.querySelector("#lint").addEventListener("click", async () => {
		const result = await linter.lint(editor.getText(), config);
		console.log(result);
	});
}

main();
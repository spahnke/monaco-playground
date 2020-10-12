import { CodeEditor } from "./code-editor.js";
import { DebugContribution } from "./debug-contribution.js";
import { PlaygroundContribution } from "./playground-contribution.js";

async function main() {
	const editor = await CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);

	editor.register(new PlaygroundContribution(editor)); // has side effects
	const debug = new DebugContribution(editor.editor);
	debug.simulateDebugging();
	editor.register(debug);

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
}

main();

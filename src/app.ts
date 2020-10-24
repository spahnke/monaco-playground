import { ILibrary } from "./common/monaco-utils.js";
import { DebugContribution } from "./contrib/debug-contribution.js";
import { PlaygroundContribution } from "./contrib/playground-contribution.js";
import { TodoContribution } from "./contrib/todo-contribution.js";
import { CodeEditor } from "./code-editor.js";

const lib: ILibrary = {
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
};

async function main() {
	const editor = await CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);

	editor.register(new TodoContribution());
	editor.register(new PlaygroundContribution(editor));
	const debug = editor.register(new DebugContribution(editor.editor));
	debug.simulateDebugging();

	editor.addLibrary(lib);

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
`, undefined, "script.js");
}

main();

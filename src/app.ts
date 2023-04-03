import { DebugContribution } from "./contrib/debug-contribution.js";
import { PlaygroundContribution, registerSlashCommands } from "./contrib/playground-contribution.js";
import { TodoContribution } from "./contrib/todo-contribution.js";
import { CodeEditor } from "./code-editor.js";
import { CodeEditorTextInput } from "./code-editor-text-input.js";
import { loadMonaco } from "./monaco-loader.js";

await loadMonaco();

const textInput = CodeEditorTextInput.create(document.querySelector<HTMLElement>("#textInput")!, undefined, "type text here");
textInput.onDidPressEnter(console.log);
textInput.register(registerSlashCommands(textInput, [{ command: "test", detail: "A test command" }, { command: "format", detail: "Formats the text" }]));

const textInput2 = CodeEditorTextInput.create(document.querySelector<HTMLElement>("#textInput2")!, "asdf", "type your search query here", "search");
textInput2.onDidChangeText(console.log);

const editor = CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);

editor.register(new TodoContribution());
editor.register(new PlaygroundContribution(editor));
editor.register(new DebugContribution(editor.editor));

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

	/**
	 * @deprecated Use \`bar\` instead
	 */
	baz() {
		return this.bar;
	}

	/**
	 * @param {Date} a Parameter test for \`qux\`
	 * @returns Returns the passed parameter \`a\` again
	 */
	qux(a) {
		return a;
	}
}

"foob\\ar";

const text = 'asdf';
const foo = new Foo();
foo.bar = Facts.next();
foo.baz();
foo.qux(new Date());
`, undefined, "script.js");

editor.addLibrary({
	contents: `const abc = 1;`,
	filePath: "library.js",
	language: "javascript"
});
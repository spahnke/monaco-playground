import { DebugContribution } from "./contrib/debug-contribution.js";
import { PlaygroundContribution } from "./contrib/playground-contribution.js";
import { TodoContribution } from "./contrib/todo-contribution.js";
import { CodeEditor } from "./code-editor.js";

async function main() {
	const editor = await CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);

	editor.register(new TodoContribution());
	editor.register(new PlaygroundContribution(editor));
	const debug = editor.register(new DebugContribution(editor.editor));
	debug.simulateDebugging();

	monaco.languages.registerInlayHintsProvider("javascript", {
		async provideInlayHints(model: monaco.editor.ITextModel, range: monaco.Range, token: monaco.CancellationToken): Promise<monaco.languages.InlayHint[]> {
			return [
				{
					kind: monaco.languages.InlayHintKind.Other,
					position: { lineNumber: 27, column: 1 },
					text: "testing"
				}
			];
		}
	});

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
}

main();

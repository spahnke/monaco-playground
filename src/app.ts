import { DebugContribution } from "./contrib/debug-contribution.js";
import { PlaygroundContribution, registerSlashCommands } from "./contrib/playground-contribution.js";
import { TodoContribution } from "./contrib/todo-contribution.js";
import { CodeEditor } from "./code-editor.js";
import { CodeEditorTextInput } from "./code-editor-text-input.js";
import { loadMonaco } from "./monaco-loader.js";
import { addLibrary } from "./common/monaco-utils.js";

await loadMonaco();

const textInput = CodeEditorTextInput.create(document.querySelector<HTMLElement>("#textInput")!, undefined, "type text here");
textInput.onDidPressEnter(console.log);
registerSlashCommands(textInput, [{ command: "test", detail: "A test command" }, { command: "format", detail: "Formats the text" }]);

const textInput2 = CodeEditorTextInput.create(document.querySelector<HTMLElement>("#textInput2")!, "asdf", "type your search query here", "search");
textInput2.onDidChangeText(console.log);

const editor = CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);

editor.register(new TodoContribution());
editor.register(new PlaygroundContribution(editor));
editor.register(new DebugContribution(editor.monacoEditor));

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

// EXPERIMENT =============================================================

const definitionEditor = CodeEditor.create(document.querySelector<HTMLElement>("#definitionEditor")!);
definitionEditor.setContents(`interface MyExports {
	/**
	 * Dies ist ein bar.
	 * Mit einem Zeilenumbruch.
	 * @displayName asdf
	 * @keywords keyword1 keyword2 keyword3
	 */
	bar: number;

	/**
	 * Oha ein baz!
	 */
	baz: string;

	qux: MyModuleResult;
}

interface MyModuleResult {
	/** Anrede */
	zeile1: string;
	/** Name */
	zeile2: string;
	/** Straße */
	zeile3: string;
	/** PLZ Ort */
	zeile4: string;
}`, undefined, "myExports.de.d.ts");

// global untyped version
addLibrary({
	contents: `
interface MyExports {
	[key: string]: any;
}

declare const myExports: MyExports;
`,
	language: "typescript",
	filePath: "exporting.d.ts"
});

// local typed version
let definitionLibrary: monaco.IDisposable | undefined;
definitionEditor.register(definitionEditor.monacoEditor.addAction({
	id: "define_my_exports",
	label: "Define my Exports",
	run: editor => {
		definitionLibrary?.dispose();
		definitionLibrary = addLibrary({
			contents: editor.getValue(),
			language: "typescript",
			filePath: "myExports.de.d.ts",
		});
	}
}));

definitionEditor.register(definitionEditor.monacoEditor.addAction({
	id: "analyze_exports",
	label: "Analyze Exports",
	run: async editor => {
		const uri = editor.getModel()!.uri;
		const fileName = uri.toString();
		const workerFactory = await monaco.typescript.getTypeScriptWorker();
		// NOTE(seb) This approach will not get us far because we don't have access to the parse tree which we would
		// need to restrict the feature set used and do other analysis. In addition the LS API here is completely
		// untyped and it's very tedious to extract the information we need from it. It's probably better to roll our
		// own integration with the TS compiler API.
		const worker = await workerFactory();
		const outline = await worker.getNavigationTree(fileName)
		for (const property of outline.childItems[0].childItems) {
			const hoverCard = await worker.getQuickInfoAtPosition(fileName, property.nameSpan.start);
			console.log(hoverCard);
		}
	}
}));
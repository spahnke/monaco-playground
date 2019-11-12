import { Linter } from "eslint";
import { CodeEditor } from "./code-editor.js";

export interface IEslintWorker {
	lint(fileName: string): Promise<Linter.LintMessage[]>;
}

async function main() {
	const editor = await CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);

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
`, "plaintext");

	const config = await (await fetch("/languages/javascript/eslintrc.json")).json();
	const worker = monaco.editor.createWebWorker<IEslintWorker>({
		moduleId: "/worker/eslint-webworker",
		label: "ESLint",
		createData: { config }
	});
	const eslint = await worker.withSyncedResources(monaco.editor.getModels().map(m => m.uri));
	console.log(await eslint.lint(monaco.Uri.file("app.js").toString()));

	worker.dispose();
}

main();

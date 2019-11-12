import { Linter } from "eslint";
import { CodeEditor } from "./code-editor.js";

export interface IEslintWorker {
	lint(code: string): Promise<Linter.LintMessage[]>;
}

interface ICreateData {
	config: Linter.Config<Linter.RulesRecord>;
}

async function main() {
	const editor = await CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);

	const config = await (await fetch("languages/javascript/eslintrc.json")).json() as Linter.Config<Linter.RulesRecord>;
	const worker = monaco.editor.createWebWorker<IEslintWorker>({
		moduleId: "/worker/eslint-webworker",
		label: "ESLint",
		createData: { config } as ICreateData
	});
	const eslint = await worker.getProxy();
	console.log(await eslint.lint(`const text = 'asdf';`));

// 	editor.setContents(`class Foo {
// 	/**
// 	 * The class Foo
// 	 *
// 	 * [Online documentation](http://www.google.de)
// 	 */
// 	constructor() {
// 		this.bar = 42;
// 	}
// }

// const text = 'asdf';
// const foo = new Foo();
// foo.bar = Facts.next();
// linq.execute('a x.id.toString() === "asdf" asdf ');
// linq.execute(\`a x.id.toString() === "asdf" asdf \`);
// linq.execute(\`a x.id.toString() === "\${text}" asdf \`);
// linq.execute('a x.id.toString() === "' + foo + '" asdf ');
// `, "javascript");
}

main();

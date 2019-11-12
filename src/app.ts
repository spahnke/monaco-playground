import { CodeEditor } from "./code-editor.js";

export interface IEslintWorker {
	greet(): Promise<string>;
}

interface ICreateData {
	name: string;
}

async function main() {
	const editor = await CodeEditor.create(document.querySelector<HTMLElement>(".editor")!);

	const worker = monaco.editor.createWebWorker<IEslintWorker>({
		moduleId: "/worker/eslint-webworker",
		label: "ESLint",
		createData: { name: "ESLint" } as ICreateData
	});
	const eslint = await worker.getProxy();
	console.log(await eslint.greet());

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
}

main();

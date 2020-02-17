import { addLibrary, ILibrary } from "../../monaco-helper.js";
import { EsLintDiagnostics } from "./eslint-diagnostics.js";
import { esnext } from "./lib.js";
import { TodoDiagnostics } from "./todo-diagnostics.js";
import { SnippetCompletionProvider } from "../snippet-completion-provider.js";
import { JsonSnippetService } from "../json-snippet-service.js";

export function registerJavascriptLanguageExtensions() {
	monaco.languages.onLanguage("javascript", () => {
		setDiagnosticOptions();

		// compiler options
		monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
			target: monaco.languages.typescript.ScriptTarget.ESNext,
			lib: [],
			alwaysStrict: true,
			checkJs: true,
			allowJs: true,
			allowNonTsExtensions: true, // not documented in the typings but important to get syntax/semantic validation working
		});

		const libraries: ILibrary[] = [
			{
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
			},
			{
				contents: esnext,
				language: "typescript",
				filePath: "lib.esnext.d.ts"
			},
		];

		for (const library of libraries)
			addLibrary(library);

		monaco.languages.registerCompletionItemProvider("javascript", new SnippetCompletionProvider(new JsonSnippetService("languages/javascript/snippets.json")));
		monaco.languages.registerCodeActionProvider("javascript", new EsLintDiagnostics("languages/javascript/eslintrc.json"));
		new TodoDiagnostics(); // has side effects
	});
}

export function setDiagnosticOptions(codesToIgnore: number[] = []): void {
	// validation settings
	const options: monaco.languages.typescript.DiagnosticsOptions = {
		noSyntaxValidation: false,
		noSemanticValidation: localStorage.getItem("monaco-no-semantic") !== null,
		noSuggestionDiagnostics: localStorage.getItem("monaco-no-suggestion") !== null,
		diagnosticCodesToIgnore: codesToIgnore
	};
	monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(options);
	monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(options);
}
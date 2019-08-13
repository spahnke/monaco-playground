import { EsLintDiagnostics } from "./eslint-diagnostics.js";

export function registerJavascriptLanguageExtensions() {
	monaco.languages.onLanguage("javascript", () => {
		monaco.languages.registerCodeActionProvider("javascript", new EsLintDiagnostics("eslintrc.json"));
	});
}
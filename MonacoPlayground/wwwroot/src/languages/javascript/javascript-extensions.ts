import { EsLintDiagnostics } from "./eslint-diagnostics.js";

const alreadyRegistered = false;

export async function registerJavascriptLanguageExtensions() {
	if (alreadyRegistered) {
		return;
	}

	const config = await fetch("eslintrc.json").then(r => r.json());
	monaco.languages.registerCodeActionProvider("javascript", new EsLintDiagnostics(config));
}
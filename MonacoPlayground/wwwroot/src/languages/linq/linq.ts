﻿import { LinqCompletionProvider } from "./linq-completion-provider.js";
import { LinqFormatter } from "./linq-formatter.js";
import { LinqHoverProvider } from "./linq-hover-provider.js";
import { languageConfig, languageId, monarchTokenProvider } from "./linq-language.js";
import { LinqDiagnostics } from "./linq-diagnostics.js";

export function registerLinq() {
	monaco.languages.register({ id: languageId });
	monaco.languages.onLanguage(languageId, () => {
		monaco.languages.setLanguageConfiguration(languageId, languageConfig);
		monaco.languages.setMonarchTokensProvider(languageId, monarchTokenProvider);
		monaco.languages.registerCompletionItemProvider(languageId, new LinqCompletionProvider());
		monaco.languages.registerDocumentFormattingEditProvider(languageId, new LinqFormatter());
		monaco.languages.registerHoverProvider(languageId, new LinqHoverProvider());
		new LinqDiagnostics(languageId); // has side effects
	});
}
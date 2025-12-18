import { createConnection, BrowserMessageReader, BrowserMessageWriter, TextDocuments,  DocumentDiagnosticReportKind, DiagnosticSeverity } from "vscode-languageserver/browser.js";
import { TextDocument } from "vscode-languageserver-textdocument";

const connection = createConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self));
connection.onInitialize(params => {
	return {
		capabilities: {
			diagnosticProvider: {
				identifier: "eslintlsp",
				interFileDependencies: false,
				workspaceDiagnostics: false,
			}
		},
	};
});

connection.languages.diagnostics.on(params => {
	const textDocument = documents.get(params.textDocument.uri);
	if (textDocument?.languageId === "javascript") {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: [
				{
					message: "Testing.",
					range: { start: { line: 29, character: 1 }, end: { line: 29, character: 1 } },
					code: "qwer",
					codeDescription: { href: "https://www.example.com" }, // Congrats this isn't supported by the monaco LSP client yet...
					severity: DiagnosticSeverity.Information,
					source: "eslintlsp"
				},
			],
		};
	} else {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: [],
		};
	}
});

const documents = new TextDocuments(TextDocument);
documents.listen(connection);
connection.listen();

connection.sendNotification("foo", "bar");
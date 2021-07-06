export class LinqFormatter implements monaco.languages.DocumentFormattingEditProvider {

	provideDocumentFormattingEdits(model: monaco.editor.ITextModel, options: monaco.languages.FormattingOptions, token: monaco.CancellationToken): monaco.languages.TextEdit[] {
        const textEdit: monaco.languages.TextEdit = {
            range: model.getFullModelRange(),
            text: LinqFormatter.formatLinqExpression(model.getValue())
        };
        return [textEdit];
	}

    public static formatLinqExpression(expression: string): string {
        expression = LinqFormatter.removeLineBreaksAndExtraWhitespace(expression);
        expression = LinqFormatter.insertLineBreaks(expression);
        return expression;
	}

    public static removeLineBreaksAndExtraWhitespace(expression: string): string {
        return expression.replace(/\r\n/g, " ").replace(/\n/g, " ").replace(/\t/g, " ").replace(/\s{2,}/g, " ");
	}

    private static insertLineBreaks(expression: string): string {
        expression = LinqFormatter.replaceIfNotInString(expression, ` from `, "\nfrom ");
        expression = LinqFormatter.replaceIfNotInString(expression, ` where `, "\nwhere ");
        expression = LinqFormatter.replaceIfNotInString(expression, ` select `, "\nselect ");
        expression = LinqFormatter.replaceIfNotInString(expression, ` group `, "\ngroup ");
        expression = LinqFormatter.replaceIfNotInString(expression, ` orderby `, "\norderby ");
        expression = LinqFormatter.replaceIfNotInString(expression, ` join `, "\njoin ");
        expression = LinqFormatter.replaceIfNotInString(expression, ` let `, "\nlet ");
        expression = LinqFormatter.replaceIfNotInString(expression, `&&`, "\n\t&& ");
        expression = LinqFormatter.replaceIfNotInString(expression, `\\|\\|`, "\n\t|| ");
        expression = LinqFormatter.replaceIfNotInString(expression, ` *{ *`, " {\n\t");
        expression = LinqFormatter.replaceIfNotInString(expression, ` *} *`, "\n}");
        expression = LinqFormatter.replaceIfNotInString(expression, ` *, *`, ",\n\t");
        expression = LinqFormatter.replaceIfNotInString(expression, ` *\\*\\/ `, "*/\n\t");
        return LinqFormatter.replaceIfNotInString(expression, ` {2,}`, " ");
	}

    private static replaceIfNotInString(expression: string, pattern: string, replacement: string): string {
        // see http://www.rexegg.com/regex-best-trick.html
        const regex = new RegExp(`"[^"]*?"|'[^']*?'|(${pattern})`, "g");
        return expression.replace(regex, (match: string, group1: string) => group1 ? replacement : match);
    }
}

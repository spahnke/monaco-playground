// @ts-nocheck

// see also https://github.com/spahnke/monaco-typescript/tree/worker-experiment for experimental integration
// -> derive code lens support from that later

function isLinqExpressionWithLiteralParameter(node: ts.Node): node is ts.CallExpression {
	if (node.kind !== ts.SyntaxKind.CallExpression)
		return false;

	const callExpression = node as ts.CallExpression;
	if (callExpression.expression.kind !== ts.SyntaxKind.PropertyAccessExpression || callExpression.arguments.length !== 1)
		return false;

	const propertyAccessExpr = callExpression.expression as ts.PropertyAccessExpression;
	if (propertyAccessExpr.expression.kind !== ts.SyntaxKind.Identifier)
		return false;

	const callee = propertyAccessExpr.expression as ts.Identifier;
	if (callee.text !== "linq" || propertyAccessExpr.name.text.indexOf("execute") !== 0)
		return false;

	const argument = callExpression.arguments[0];
	if (argument.kind !== ts.SyntaxKind.StringLiteral && argument.kind !== ts.SyntaxKind.NoSubstitutionTemplateLiteral && argument.kind !== ts.SyntaxKind.TemplateExpression)
		return false;

	return true;
}

const recurse = (parent: ts.Node, depth: number) => {
	if (depth > 5) return;
	ts.forEachChild(parent, (node) => {
		if (this.isLinqExpressionWithLiteralParameter(node))
			console.log(node, node.arguments[0].getText());
		recurse(node, depth + 1);
	});
};
recurse(this._languageService.getProgram()?.getSourceFile(fileName)!, 0);
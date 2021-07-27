import { AST, Rule } from "eslint";
import { CallExpression, Expression, Identifier, Literal, SourceLocation, TemplateLiteral, VariableDeclarator } from "estree";

export default new class implements Rule.RuleModule {
	private readonly reportPattern = /\.[a-z0-9]*?id\.toString\(\)\s*[!=]==?\s*"(?:[^"]*?")?/gi;
	private readonly fixPattern = /(id)\.toString\(\)(\s*[!=]==?\s*)("[^"]*?")/i;
	private reportedLocations: Set<string> = new Set();

	create(context: Rule.RuleContext): Rule.RuleListener {
		this.reportedLocations = new Set();
		return {
			CallExpression: node => {
				if (!this.isQuery(node))
					return;
				const queryExpression = node.arguments[0];
				if (queryExpression.type === "SpreadElement")
					return;
				this.checkExpression(context, queryExpression);
			}
		};
	}

	private isQuery(callExpression: CallExpression): boolean {
		if (callExpression.callee.type !== "MemberExpression")
			return false;

		const memberExpression = callExpression.callee;
		if (memberExpression.object.type !== "Identifier" || memberExpression.property.type !== "Identifier")
			return false;

		const object = memberExpression.object;
		const method = memberExpression.property;
		if (object.name !== "linq" || method.name !== "execute" && method.name !== "executeWritable" || callExpression.arguments.length === 0)
			return false;

		return true;
	}

	private checkExpression(context: Rule.RuleContext, expression: Expression) {
		// if it's a binary expression (i.e. string concatenation) we collect all sub expressions and check against them
		const expressionsToCheck: Expression[] = [];
		while (expression.type === "BinaryExpression") {
			expressionsToCheck.unshift(expression.right);
			expression = expression.left;
		}
		expressionsToCheck.unshift(expression);

		for (const expression of expressionsToCheck) {
			if (expression.type === "Literal" || expression.type === "TemplateLiteral")
				this.reportStringOrTemplateLiteral(context, expression);
			else if (expression.type === "Identifier")
				this.reportVariable(context, expression);
		}
	}

	private reportStringOrTemplateLiteral(context: Rule.RuleContext, literal: Literal | TemplateLiteral) {
		const value = context.getSourceCode().getText(literal);
		const matches = value.matchAll(this.reportPattern);
		for (const match of matches)
			this.report(context, literal, this.computeLocationInsideLiteral(literal, match));
	}

	private reportVariable(context: Rule.RuleContext, identifier: Identifier) {
		const declarator = this.getVariableDeclarator(context, identifier);
		if (!declarator?.init)
			return;
		this.checkExpression(context, declarator.init);
	}

	private computeLocationInsideLiteral(literal: Literal | TemplateLiteral, match: RegExpMatchArray): SourceLocation | undefined {
		if (!literal.loc)
			return undefined;

		const location: SourceLocation = {
			start: { ...literal.loc.start },
			end: { ...literal.loc.end },
		};

		const offset = (match.index ?? 0) + 1; // +1 for the leading '.'
		const columnStart = location.start.column + offset;
		location.start.column = columnStart;
		location.end.column = columnStart + match[0].length - 1; // -1 for the leading '.'

		return location;
	}

	private getVariableDeclarator(context: Rule.RuleContext, identifier: Identifier): VariableDeclarator | undefined {
		const scope = context.getScope();
		const variable = scope.set.get(identifier.name);
		if (!variable)
			return undefined;

		const definition = variable.defs[0];
		if (definition?.type !== "Variable")
			return undefined;
		return definition.node;
	}

	private report(context: Rule.RuleContext, node: Literal | TemplateLiteral, loc?: SourceLocation): void {
		if (!loc)
			return;

		const locationKey = `${loc.start.line}-${loc.start.column}-${loc.end.line}-${loc.end.column}`;
		if (this.reportedLocations.has(locationKey))
			return;

		this.reportedLocations.add(locationKey);
		context.report({
			message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.",
			node,
			loc,
			suggest: [
				{
					desc: "Convert `string` to `Guid` instead",
					fix: fixer => this.applyFix(fixer, context, node, loc)
				}
			]
		});
	}

	private applyFix(fixer: Rule.RuleFixer, context: Rule.RuleContext, node: Literal | TemplateLiteral, loc: SourceLocation): Rule.Fix | null {
		if (!node.loc || !node.range)
			return null;

		const literalText = context.getSourceCode().getText(node);

		const [rangeStart] = node.range;
		const startOffset = loc.start.column - node.loc.start.column;
		const endOffset = loc.end.column - node.loc.start.column;
		const replaceRange: AST.Range = [rangeStart + startOffset, rangeStart + endOffset];

		const textToReplace = literalText.substring(startOffset, endOffset);
		const replaceText = textToReplace.replace(this.fixPattern, "$1$2new Guid($3)");

		if (textToReplace === replaceText)
			return null;

		return fixer.replaceTextRange(replaceRange, replaceText);
	}
};

import { AST, Linter, Rule } from "eslint";
import { CallExpression, Expression, Identifier, Literal, SourceLocation, TemplateLiteral, VariableDeclarator } from "estree";

export class NoIdToStringInQuery implements Rule.RuleModule {
	static register(linter: Linter): void {
		linter.defineRule("no-id-tostring-in-query", new NoIdToStringInQuery());
	}

	private readonly reportPattern = /id\.toString\(\)\s*[!=]==?\s*"(?:[^"]*?")?/gi;
	private readonly fixPattern = /(id)\.toString\(\)(\s*[!=]==?\s*)("[^"]*?")/i;
	private reportedLocations: Set<string> = new Set();

	create(context: Rule.RuleContext): Rule.RuleListener {
		this.reportedLocations = new Set();
		return {
			Literal: node => this.checkStringOrTemplateLiteral(context, node),
			TemplateLiteral: node => this.checkStringOrTemplateLiteral(context, node),
			Identifier: node => {
				let parent = node.parent;
				while (parent) {
					if (parent.type === "CallExpression" && this.isQuery(parent)) {
						this.reportVariable(context, node);
						return;
					}
					parent = parent.parent;
				}
			}
		};
	}

	private checkStringOrTemplateLiteral(context: Rule.RuleContext, literal: (Literal | TemplateLiteral) & Rule.NodeParentExtension) {
		let parent = literal.parent;
		while (parent) {
			if (parent.type === "CallExpression" && this.isQuery(parent)) {
				this.reportStringOrTemplateLiteral(context, literal);
				return;
			}
			parent = parent.parent;
		}
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

	private reportStringOrTemplateLiteral(context: Rule.RuleContext, literal: Literal | TemplateLiteral) {
		const value = context.getSourceCode().getText(literal);
		let match = this.reportPattern.exec(value);
		while (match !== null) {
			this.report(context, literal, this.computeLocationInsideLiteral(literal, match));
			match = this.reportPattern.exec(value);
		}
	}

	private reportVariable(context: Rule.RuleContext, identifier: Identifier) {
		const declarator = this.getVariableDeclarator(context, identifier);
		let init = declarator?.init;
		if (!init)
			return;

		// if it's a binary expression (i.e. string concatenation) we collect all sub expressions and check against them
		const expressionsToCheck: Expression[] = [];
		while (init.type === "BinaryExpression") {
			expressionsToCheck.unshift(init.right);
			init = init.left;
		}
		expressionsToCheck.unshift(init);

		for (const expression of expressionsToCheck) {
			if (expression.type === "Literal" || expression.type === "TemplateLiteral")
				this.reportStringOrTemplateLiteral(context, expression);
			else if (expression.type === "Identifier")
				this.reportVariable(context, expression);
		}
	}

	private computeLocationInsideLiteral(literal: Literal | TemplateLiteral, match: RegExpExecArray): SourceLocation | undefined {
		if (!literal.loc)
			return undefined;

		const location: SourceLocation = {
			start: { ...literal.loc.start },
			end: { ...literal.loc.end },
		};

		const offset = match.index;
		const columnStart = location.start.column + offset;
		location.start.column = columnStart;
		location.end.column = columnStart + match[0].length;

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
		// console.group();
		// console.log(node);
		// console.log(loc);
		// console.log(replaceRange);
		// console.log(literalText);
		// console.log(textToReplace);
		// console.log(replaceText);
		// console.groupEnd();

		if (textToReplace === replaceText)
			return null;

		return fixer.replaceTextRange(replaceRange, replaceText);
	}
}

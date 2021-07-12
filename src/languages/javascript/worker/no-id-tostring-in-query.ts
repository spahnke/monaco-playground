import { Linter, Rule } from "eslint";
import { CallExpression, Identifier, Literal, SourceLocation, TemplateLiteral, VariableDeclarator } from "estree";

export const ruleId = "no-id-tostring-in-query";

export class NoIdToStringInQuery implements Rule.RuleModule {
	static register(linter: Linter): void {
		linter.defineRule(ruleId, new NoIdToStringInQuery());
	}

	create(context: Rule.RuleContext): Rule.RuleListener {
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
		const regex = /id\.toString\(\)\s*[!=]==?\s*"([^"]*?")?/gi;
		let match = regex.exec(value);
		while (match !== null) {
			context.report(this.getDiagnostic(context, literal, this.computeLocationInsideLiteral(literal, match)));
			match = regex.exec(value);
		}
	}

	private reportVariable(context: Rule.RuleContext, identifier: Identifier) {
		const declarator = this.getVariableDeclarator(context, identifier);
		if (!declarator || !declarator.init)
			return;

		if (declarator.init.type === "Literal")
			this.reportStringOrTemplateLiteral(context, declarator.init);
		else if (declarator.init.type === "Identifier")
			this.reportVariable(context, declarator.init);
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

	private getDiagnostic(context: Rule.RuleContext, node: Literal | TemplateLiteral, loc?: SourceLocation): Rule.ReportDescriptor {
		return {
			message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.",
			node,
			loc,
			suggest: [
				{
					desc: "Convert `string` to `Guid` instead",
					fix: fixer => this.applyFix(fixer, context, node, loc)
				}
			]
		};
	}

	private applyFix(fixer: Rule.RuleFixer, context: Rule.RuleContext, node: Literal | TemplateLiteral, loc?: SourceLocation): Rule.Fix | null {
		if (!loc)
			return null;

		const literalText = context.getSourceCode().getText(node);
		const text = literalText.substring(loc.start.column - node.loc!.start.column, loc.end.column - node.loc!.start.column);
		const regex = /(id)\.toString\(\)(\s*[!=]==?\s*)("[^"]*?")/i;
		const newText = text.replace(regex, "$1$2new Guid($3)");
		// console.group();
		// console.log(literalText);
		// console.log(text);
		// console.log(newText);
		// console.groupEnd();

		if (text === newText)
			return null;

		const newNodeText = literalText.replace(text, newText);
		return fixer.replaceText(node, newNodeText);
	}
}

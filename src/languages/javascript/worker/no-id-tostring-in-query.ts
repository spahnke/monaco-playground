import { Linter, Rule } from "eslint";
import { CallExpression, Identifier, Literal, SourceLocation, TemplateElement, VariableDeclarator } from "estree";

export const ruleId = "no-id-tostring-in-query";

export class NoIdToStringInQuery implements Rule.RuleModule {
	static register(linter: Linter): void {
		linter.defineRule(ruleId, new NoIdToStringInQuery());
	}

	create(context: Rule.RuleContext): Rule.RuleListener {
		return {
			Literal: node => this.checkStringLiteral(context, node),
			TemplateElement: node => this.checkStringLiteral(context, node),
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

	private checkStringLiteral(context: Rule.RuleContext, literal: (Literal | TemplateElement) & Rule.NodeParentExtension) {
		let parent = literal.parent;
		while (parent) {
			if (parent.type === "CallExpression" && this.isQuery(parent)) {
				this.reportStringLiteral(context, literal);
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

	private reportStringLiteral(context: Rule.RuleContext, literal: Literal | TemplateElement) {
		const value = typeof literal.value === "object" ? (literal as TemplateElement).value.cooked : literal.value;
		if (typeof value !== "string")
			return;

		const regex = /id\.toString\(\)/gi;
		let match = regex.exec(value);
		while (match !== null) {
			context.report(this.getDiagnostic(literal, this.computeLocationInsideLiteral(literal, match)));
			match = regex.exec(value);
		}
	}

	private reportVariable(context: Rule.RuleContext, identifier: Identifier) {
		const declarator = this.getVariableDeclarator(context, identifier);
		if (!declarator || !declarator.init)
			return;

		if (declarator.init.type === "Literal")
			this.reportStringLiteral(context, declarator.init);
		else if (declarator.init.type === "Identifier")
			this.reportVariable(context, declarator.init);
	}

	private computeLocationInsideLiteral(literal: Literal | TemplateElement, match: RegExpExecArray): SourceLocation | undefined {
		if (!literal.loc)
			return undefined;

		const location: SourceLocation = {
			start: { ...literal.loc.start },
			end: { ...literal.loc.end },
		};

		const offset = literal.type === "Literal" ? match.index + 1 : match.index; // literal starts with `"` so we need to add 1
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

	private getDiagnostic(node: Literal | TemplateElement, loc?: SourceLocation): Rule.ReportDescriptor {
		return {
			message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.",
			node,
			loc,
			suggest: [
				{
					desc: "Convert `string` to `Guid` instead",
					fix: fixer => this.applyFix(fixer, node, loc)
				}
			]
		};
	}

	private applyFix(fixer: Rule.RuleFixer, node: Literal | TemplateElement, loc?: SourceLocation): Rule.Fix | null {
		if (!loc)
			return null;

		const literalString = node.type === "Literal" ? node.raw : node.value.raw;
		if (!literalString)
			return null;

		// console.log("");
		// console.log(literalString);
		// console.log(node, loc);

		const text = literalString.substring(loc.start.column - node.loc!.start.column);
		// console.log(text);
		const regex = /(id)\.toString\(\)(\s*===?\s*)(".*?")/i;
		const newText = text.replace(regex, "$1$2new Guid($3)");
		// console.log(newText);

		if (text === newText)
			return null;

		let newNodeText = literalString.replace(text, newText);
		if (node.type === "TemplateElement")
			newNodeText = "`" + newNodeText + "`";
		// console.log(newNodeText);

		return fixer.replaceText(node, newNodeText);
	}
}

import { Linter, Rule } from "./node_modules/@types/eslint/index";
import { CallExpression, Identifier, Literal,  Node, SourceLocation, VariableDeclarator } from "./node_modules/@types/estree/index";

class NoIdToStringInQuery implements Rule.RuleModule {
	static register(linter: Linter) {
		linter.defineRule("no-id-tostring-in-query", new NoIdToStringInQuery());
	}

	create(context: Rule.RuleContext): Rule.RuleListener {
		return {
			Literal: (node: Node) => {
				const literal = node as Literal;
				let parent: Node = (literal as any).parent;
				while (parent) {
					if (parent.type === "CallExpression" && this.isQuery(parent)) {
						this.reportStringLiteral(context, literal);
						return;
					}
					parent = (parent as any).parent;
				}
			},
			Identifier: (node: Node) => {
				const identifier = node as Identifier;
				let parent: Node = (identifier as any).parent;
				while (parent) {
					if (parent.type === "CallExpression" && this.isQuery(parent)) {
						this.reportVariable(context, identifier);
						return;
					}
					parent = (parent as any).parent;
				}
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

	private reportStringLiteral(context: Rule.RuleContext, literal: Literal) {
		if (typeof literal.value !== "string")
			return;

		const regex = /id\.toString\(\)/gi;
		let match = regex.exec(literal.value);
		while (match !== null) {
			context.report(this.getDiagnostic(literal, this.computeLocationInsideLiteral(literal, match)));
			match = regex.exec(literal.value);
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

	private computeLocationInsideLiteral(literal: Literal, match: RegExpExecArray): SourceLocation | undefined {
		if (!literal.loc)
			return undefined;

		const location: SourceLocation = {
			start: { ...literal.loc.start },
			end: { ...literal.loc.end },
		};

		const offset = match.index + 1; // literal starts with `"` so we need to add 1
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
		if (!definition)
			return undefined;

		const declarator = definition.node as Node;
		if (declarator.type !== "VariableDeclarator")
			return undefined;

		return declarator;
	}

	private getDiagnostic(node: Node, loc?: SourceLocation): Rule.ReportDescriptor {
		return {
			message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.",
			node,
			loc
		};
	}
}

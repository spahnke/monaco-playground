var NoIdToStringInQuery = /** @class */ (function () {
    function NoIdToStringInQuery() {
    }
    NoIdToStringInQuery.register = function (linter) {
        linter.defineRule("no-id-tostring-in-query", new NoIdToStringInQuery());
    };
    NoIdToStringInQuery.prototype.create = function (context) {
        var _this = this;
        return {
            CallExpression: function (node) {
                var callExpression = node;
                if (!_this.isQuery(callExpression))
                    return;
                var argument = callExpression.arguments[0];
                if (argument.type === "Literal")
                    _this.handleQueryLiteral(context, argument);
            }
        };
    };
    NoIdToStringInQuery.prototype.isQuery = function (callExpression) {
        if (callExpression.callee.type !== "MemberExpression" || callExpression.arguments.length === 0)
            return false;
        var memberExpression = callExpression.callee;
        if (memberExpression.object.type !== "Identifier" || memberExpression.property.type !== "Identifier")
            return false;
        var object = memberExpression.object;
        var property = memberExpression.property;
        if (object.name !== "linq" || property.name !== "execute" && property.name !== "executeWritable")
            return false;
        return true;
    };
    NoIdToStringInQuery.prototype.handleQueryLiteral = function (context, literal) {
        if (typeof literal.value !== "string")
            return;
        if (!/id\.toString\(\)/i.test(literal.value))
            return;
        context.report(this.getDiagnostic(literal));
    };
    NoIdToStringInQuery.prototype.getDiagnostic = function (node) {
        return {
            message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.",
            node: node
        };
    };
    return NoIdToStringInQuery;
}());

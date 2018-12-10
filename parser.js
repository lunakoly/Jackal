class Parser extends Lexer {
	reset(source) {
		super.reset(source)

		this.errors = []
		this.scope = new Program()
	}

	report(message) {
		this.errors.push(`[Error at line ${this.line}] ${message}`)
		// this.styledSource += Formatter.style(`[Error at line ${this.line}] ${message}`, 'comment')
	}

	parse(source) {
		this.reset(source)
		return this.parseProgram()
	}

	assert(token, style = '') {
		if (!this.accept(token, style)) {
			this.acceptNonBlank('error')
			this.report(`'${token}' expected but ${this.value} found`)
			return false
		}
		return true
	}

	assertIdentifier(style = '') {
		if (!this.acceptIdentifier(style)) {
			this.acceptNonBlank('error')
			this.report(`Identifier expected but ${this.value} found`)
			return false
		}
		return true
	}

	parseIdentifier(style = '') {
		if (this.acceptIdentifier(style))
			return new Terminal(this.value, style)

		this.acceptNonBlank('error')
		return new Terminal('<something>', 'error')
	}

	parseResolvableIdentifier() {
		this.skipIndent()

		if (this.readIdentifier()) {
			const style = this.scope.resolve(this.value)
			const escaped = Formatter.escape(this.value || '')
			this.styledSource += Formatter.style(escaped, style)
			return new Terminal(this.value, style)
		}

		this.acceptNonBlank('error')
		return new Terminal('<something>', 'error')
	}

	parseTerminal() {
		if (this.accept('(')) {
			const nested = this.parseExpression()

			if (!this.assert(')'))
				return new Terminal('<something>', 'error')

			return nested
		}

		if (this.acceptNumber('number'))
			return new Terminal(this.value, 'number')

		if (this.acceptTextLiteral('text-literal'))
			return new Terminal(this.value, 'text-literal')

		return this.parseResolvableIdentifier()
	}

	parseParamenters(closingOperator) {
		if (this.accept(closingOperator))
			return new Parameters()

		const first = this.parseRange()
		const params = new Parameters(first)

		while (this.accept(','))
			params.items.push(this.parseRange())

		if (!this.accept(closingOperator))
			return new Terminal('[parameters]', 'error')

		return params
	}

	parseCall() {
		let current = this.parseTerminal()

		while (this.hasNext()) {

			if (this.accept('(')) {
				const params = this.parseParamenters(')')
				current = new FunctionCall(current, params)

			} else if (this.accept('[')) {
				const params = this.parseParamenters(']')
				current = new ArrayCall(current, params)

			} else if (this.acceptSingleDot()) {
				if (this.assertIdentifier('variable'))
					current = new FieldCall(current, new Terminal(this.value, 'variable'))
				else
					current = new FieldCall(current, new Terminal('<field>', 'error'))

			} else if (this.accept('^')) {
				current = new Postfix(current, '^')

			} else {
				break
			}
		}

		return current
	}

	parseItem() {
		if (this.accept('-'))
			return new Prefix(this.parseCall(), '-')

		if (this.accept('@'))
			return new Prefix(this.parseCall(), '@')

		if (this.acceptKeyword('not', 'operator'))
			return new Prefix(this.parseCall(), new Terminal('not ', 'operator'))

		return this.parseCall()
	}

	parsePower() {
		let current = this.parseItem()

		while (this.accept('**')) {
			const next = this.parseItem()

			const ln = new Terminal('ln', 'function')
			const exp = new Terminal('exp', 'function')

			const lnCall = new FunctionCall(ln, current)
			const expCall = new FunctionCall(exp, new Binary(next, lnCall, '*', 2))

			current = expCall
		}

		return current
	}

	parseMonomial() {
		let current = this.parsePower()

		while (this.hasNext()) {
			let operator = null

			if (
				this.accept('*') || this.accept('/') ||
				this.accept('<<') || this.accept('>>')
			) operator = this.value

			else if (
				this.acceptKeyword('div', 'operator') || this.acceptKeyword('mod', 'operator') ||
				this.acceptKeyword('and', 'operator') || this.acceptKeyword('shl', 'operator') ||
				this.acceptKeyword('shr', 'operator') || this.acceptKeyword('as', 'operator')
			) operator = new Terminal(this.value, 'operator')

			else
				break

			const next = this.parsePower()
			current = new Binary(current, next, operator, 2)
		}

		return current
	}

	parsePolynomial() {
		let current = this.parseMonomial()

		while (this.hasNext()) {
			let operator = null

			if (this.accept('+') || this.accept('-'))
				operator = this.value

			else if (
				this.acceptKeyword('xor', 'operator') ||
				this.acceptKeyword('or', 'operator')
			) operator = new Terminal(this.value, 'operator')

			else
				break

			const next = this.parseMonomial()
			current = new Binary(current, next, operator, 1)
		}

		return current
	}

	parseRange() {
		const first = this.parsePolynomial()

		if (this.accept('..'))
			return new Range(first, this.parsePolynomial())

		return first
	}

	parseExpression() {
		let current = this.parseRange()

		while (
			this.accept('==') || this.accept('<>') ||
			this.accept('<=') || this.accept('>=') ||
			this.accept('<') || this.accept('>')
		) {
			const operator = this.value
			const next = this.parseRange()
			current = new Binary(current, next, operator, 0)
		}

		return current
	}

	parseDecalrationType() {
		let type = null

		if (this.accept('^'))
			type = new Prefix(this.parseResolvableIdentifier(), '^')
		else
			type = this.parseResolvableIdentifier()

		while (this.accept('.')) {
			const field = this.parseIdentifier('variable')
			type = new FieldCall(type, field)
		}

		while (this.accept('[')) {
			const params = this.parseParamenters(']')
			type = new ArrayCall(type, params)
		}

		if (
			this.acceptKeyword('array', 'collection') ||
			this.acceptKeyword('set', 'collection')
		) {
			let kind = new Terminal(this.value, 'collection')

			while (this.accept('[')) {
				const params = this.parseParamenters(']')
				kind = new ArrayCall(kind, params)
			}

			return new Collection(type, kind)
		}

		return type
	}

	parseConstDeclaration() {
		const identifier = this.parseIdentifier('constant')

		if (!this.assert('='))
			return new Declaration(null, null, new Terminal('<value>', 'error'), identifier)

		const value = this.parseExpression()
		this.scope.namespace[identifier.value] = 'constant'
		return new Declaration(null, null, value, identifier)
	}

	parseTypeDeclaration() {
		const identifier = this.parseIdentifier('type')

		if (!this.assert('='))
			return new Declaration(null, null, new Terminal('<value>', 'error'), identifier)

		const value = this.parseDecalrationType()
		this.scope.namespace[identifier.value] = 'type'
		return new Declaration(null, null, value, identifier)
	}

	parseVarDeclaration() {
		const identifiers = []
		let stop = false

		while (!stop) {
			const identifier = this.parseIdentifier('variable')
			this.scope.namespace[identifier.value] = 'variable'
			identifiers.push(identifier)

			if (!this.accept(','))
				stop = true
		}

		let value = null
		let type = null

		if (this.accept(':'))
			type = this.parseDecalrationType()

		if (this.accept('='))
			value = this.parseExpression()

		return new Declaration(null, type, value, ...identifiers)
	}

	parseArgumentDeclaration() {
		let style = 'variable'
		let modifier = null

		if (this.acceptKeyword('var', 'modifier')) {
			modifier = new Terminal('var', 'modifier')
			style = 'variable-argument'

		} else if (this.acceptKeyword('const', 'modifier')) {
			modifier = new Terminal('const', 'modifier')
			style = 'constant'
		}

		const identifier = this.parseIdentifier(style)
		this.scope.namespace[identifier.value] = style

		let value = null
		let type = null

		if (this.assert(':'))
			type = this.parseDecalrationType()
		else
			type = new Terminal('<type>', 'error')

		if (this.accept('='))
			value = this.parseExpression()

		return new Declaration(modifier, type, value, identifier)
	}

	enterScope() {
		this.indent += 4
		return this.indent
	}

	isInScope(indent) {
		this.skipIndent()
		return this.hasNext() && this.indent >= indent
	}

	parseFun() {
		const indent = this.enterScope()
		const fun = new Fun(this.scope)
		let isNameDefined = false

		if (this.assertIdentifier('function')) {
			fun.name = new Terminal(this.value, 'function')
			isNameDefined = true
		} else {
			fun.name = new Terminal('<identifier>', 'error')
		}

		if (!this.assert('('))
			return new Terminal('<function>', 'error')

		this.scope = fun

		if (!this.accept(')')) {
			let stop = false

			while (!stop) {
				const declaration = this.parseArgumentDeclaration()
				fun.args.push(declaration)

				if (!this.accept(','))
					stop = true
			}

			if (!this.assert(')')) {
				this.scope = fun.parent
				return new Terminal('<function>', 'error')
			}
		}

		if (this.accept(':'))
			fun.returnType = this.parseDecalrationType()

		if (isNameDefined)
			fun.parent.namespace[fun.name.value] = 'function'

		if (this.accept('=')) {
			const value = this.parseExpression()
			fun.commands.push(new Binary(fun.name, value, ':='))
		} else {
			while (this.isInScope(indent)) {
				this.skipIndent()

				if (this.indent > indent) {
					this.acceptLine('error')
					this.report(`Incorrect indent size ${this.indent}`)
					continue
				}

				this.parseExtendedStatement()
			}
		}

		this.scope = fun.parent
		return fun
	}

	parseIfStatement(indent) {
		const statement = new IfStatement()
		statement.condition = this.parseExpression()
		statement.onTrue = new Block(this.scope, this.scope.indentLevel + 1)

		this.scope = statement.onTrue

		while (this.isInScope(indent)) {
			this.skipIndent()

			if (this.indent > indent) {
				this.acceptLine('error')
				this.report(`Incorrect indent size ${this.indent}`)
				continue
			}

			statement.onTrue.commands.push(this.parseStatement())
		}

		this.scope = statement.onTrue.parent
		this.skipIndent()

		if (
			this.indent >= indent - 4 &&
			this.acceptKeyword('else', 'keyword')
		) {
			if (this.acceptKeyword('if', 'keyword')) {
				this.indent = indent
				statement.onFalse = this.parseIfStatement(indent)
			} else {
				statement.onFalse = new Block(this.scope, this.scope.indentLevel + 1)
				this.scope = statement.onFalse
				this.indent = indent

				while (this.isInScope(indent)) {
					this.skipIndent()

					if (this.indent > indent) {
						this.acceptLine('error')
						this.report(`Incorrect indent size ${this.indent}`)
						continue
					}

					statement.onFalse.commands.push(this.parseStatement())
				}
			}
		}

		this.scope = statement.onTrue.parent
		return statement
	}

	parseWhileStatement(indent) {
		const statement = new WhileStatement()
		statement.condition = this.parseExpression()
		statement.block = new Block(this.scope, this.scope.indentLevel + 1)

		this.scope = statement.block

		while (this.isInScope(indent)) {
			this.skipIndent()

			if (this.indent > indent) {
				this.acceptLine('error')
				this.report(`Incorrect indent size ${this.indent}`)
				continue
			}

			statement.block.commands.push(this.parseStatement())
		}

		this.scope = statement.block.parent
		return statement
	}

	parseForStatement(indent) {
		const statement = new ForStatement()

		if (!this.assertIdentifier('variable'))
			return new Terminal('<for loop>', 'error')

		const predefined = this.scope.resolve(this.value)

		if (predefined === 'unknown') {
			this.scope.addVar(new Declaration(null, new Terminal('integer', 'type'),
					null, new Terminal(this.value, 'variable')))
		} else if (predefined !== 'variable') {
			this.report(`Identifier ${this.value} has already been declared as ${predefined}`)
			return new Terminal('<for loop>', 'error')
		}

		statement.iterator = new Terminal(this.value, 'variable')

		if (!this.assert('='))
			return new Terminal('<for loop>', 'error')

		statement.from = this.parseExpression()

		if (
			!this.acceptKeyword('to', 'keyword') &&
			!this.acceptKeyword('downTo', 'keyword')
		) {
			this.acceptNonBlank('error')
			this.report(`'to' or 'downTo' expected but ${this.value} found`)
			return new Terminal('<for loop>', 'error')
		}

		if (this.value === 'downTo')
			statement.towards = false

		statement.to = this.parseExpression()
		statement.block = new Block(this.scope, this.scope.indentLevel + 1)
		this.scope = statement.block

		while (this.isInScope(indent)) {
			this.skipIndent()

			if (this.indent > indent) {
				this.acceptLine('error')
				this.report(`Incorrect indent size ${this.indent}`)
				continue
			}

			statement.block.commands.push(this.parseStatement())
		}

		this.scope = statement.block.parent
		return statement
	}

	parseWithStatement(indent) {
		const statement = new WithStatement()
		statement.target = this.parseExpression()
		statement.block = new WithBlock(this.scope, this.scope.indentLevel + 1)

		this.scope = statement.block

		while (this.isInScope(indent)) {
			this.skipIndent()

			if (this.indent > indent) {
				this.acceptLine('error')
				this.report(`Incorrect indent size ${this.indent}`)
				continue
			}

			statement.block.commands.push(this.parseStatement())
		}

		this.scope = statement.block.parent
		return statement
	}

	parseRepeatStatement(indent) {
		const statement = new RepeatStatement()
		statement.block = new Block(this.scope, this.scope.indentLevel + 1)

		this.scope = statement.block

		while (this.isInScope(indent)) {
			this.skipIndent()

			if (this.indent > indent) {
				this.acceptLine('error')
				this.report(`Incorrect indent size ${this.indent}`)
				continue
			}

			statement.block.commands.push(this.parseStatement())
		}

		this.scope = statement.block.parent

		if (!this.acceptKeyword('until', 'keyword')) {
			this.acceptNonBlank('error')
			this.report(`'until' expected but '${this.value}' found`)
			return new Terminal('<repeat block>', 'error')
		}

		statement.condition = this.parseExpression()
		return statement
	}

	parseStatement() {
		if (this.acceptKeyword('if', 'keyword'))
			return this.parseIfStatement(this.enterScope())

		if (this.acceptKeyword('while', 'keyword'))
			return this.parseWhileStatement(this.enterScope())

		if (this.acceptKeyword('for', 'keyword'))
			return this.parseForStatement(this.enterScope())

		if (this.acceptKeyword('with', 'keyword'))
			return this.parseWithStatement(this.enterScope())

		if (this.acceptKeyword('repeat', 'keyword'))
			return this.parseRepeatStatement(this.enterScope())

		if (this.acceptKeyword('return', 'keyword')) {
			const value = this.parseExpression()
			const exit = new Terminal('exit', 'function')
			const exitCall = new FunctionCall(exit, value)
			return exitCall
		}

		const lvalue = this.parseCall()

		if (this.accept('=')) {
			const rvalue = this.parseExpression()
			return new Binary(lvalue, rvalue, ':=')
		}

		if (this.accept('+=')) {
			const rvalue = this.parseExpression()
			return new Binary(lvalue, new Binary(lvalue, rvalue, '+', 1), ':=')
		}

		if (this.accept('-=')) {
			const rvalue = this.parseExpression()
			return new Binary(lvalue, new Binary(lvalue, rvalue, '-', 1), ':=')
		}

		if (this.accept('*=')) {
			const rvalue = this.parseExpression()
			return new Binary(lvalue, new Binary(lvalue, rvalue, '*', 2), ':=')
		}

		if (this.accept('/=')) {
			const rvalue = this.parseExpression()
			return new Binary(lvalue, new Binary(lvalue, rvalue, '/', 2), ':=')
		}

		return lvalue
	}

	parseExtendedStatement() {
		if (this.acceptKeyword('const', 'keyword')) {
			const indent = this.enterScope()

			while (this.isInScope(indent))
				this.scope.addConst(this.parseConstDeclaration())

			return
		}

		if (this.acceptKeyword('type', 'keyword')) {
			const indent = this.enterScope()

			while (this.isInScope(indent))
				this.scope.addType(this.parseTypeDeclaration())

			return
		}

		if (this.acceptKeyword('var', 'keyword')) {
			const indent = this.enterScope()

			while (this.isInScope(indent))
				this.scope.addVar(this.parseVarDeclaration())

			return
		}

		this.scope.commands.push(this.parseStatement())
	}

	parseProgram() {
		if (this.acceptKeyword('program', 'keyword')) {
			if (this.acceptIdentifier('program-name'))
				this.scope.setProgram(new Terminal(this.value, 'program-name'))
			else
				this.report('\'program\' statement requires an identifier')
		}

		while (this.hasNext()) {
			this.skipIndent()

			if (this.indent !== 0) {
				this.acceptLine('error')
				this.report(`Incorrect indent size ${this.indent}`)
				continue
			}

			if (this.acceptKeyword('fun', 'keyword'))
				this.scope.addFun(this.parseFun())

			else
				this.parseExtendedStatement()
		}

		return this.scope
	}
}

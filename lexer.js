class Lexer extends Reader {
	reset(source) {
		super.reset(source)

		this.lexerCache = {
			previous: null,
			styledSource: '',
			indent: 0,
			line: 0
		}
	}

	stepIn() {
		super.stepIn()

		this.lexerCache = {
			previous: this.lexerCache,
			indent: this.lexerCache.indent,
			line: this.lexerCache.line,
			styledSource: ''
		}
	}

	drop() {
		this.lexerCache = this.lexerCache.previous
		return super.drop()
	}

	apply() {
		const last = this.lexerCache
		this.lexerCache = this.lexerCache.previous

		this.lexerCache.styledSource += last.styledSource
		this.lexerCache.indent = last.indent
		this.lexerCache.line = last.line

		return super.apply()
	}

	get styledSource() {
		return this.lexerCache.styledSource
	}

	set styledSource(styledSource) {
		this.lexerCache.styledSource = styledSource
	}

	get indent() {
		return this.lexerCache.indent
	}

	set indent(indent) {
		this.lexerCache.indent = indent
	}

	get line() {
		return this.lexerCache.line
	}

	set line(line) {
		this.lexerCache.line = line
	}

	skipIndent() {
		let newLineFound = false

		while (this.hasSomeSpace()) {
			if (newLineFound || this.line === 0)
				this.indent += 1

			if (this.source[this.index] === '\n') {
				newLineFound = true
				this.indent = 0
				this.line += 1
			}

			this.styledSource += this.source[this.index]
			this.index += 1
		}
	}

	pushStyleOnSuccess(result, style) {
		const escaped = Formatter.escape(this.value || '')

		if (result) {
			if (style)
				this.styledSource += Formatter.style(escaped, style)
			else
				this.styledSource += escaped
		}

		return result
	}

	accept(token, style) {
		this.skipIndent()
		return this.pushStyleOnSuccess(this.read(token), style)
	}

	acceptNonBlank(style) {
		this.skipIndent()
		return this.pushStyleOnSuccess(this.readNonBlank(), style)
	}

	acceptLine(style) {
		this.skipIndent()
		return this.pushStyleOnSuccess(this.readLine(), style)
	}

	acceptKeyword(token, style) {
		this.skipIndent()
		return this.pushStyleOnSuccess(this.readKeyword(token), style)
	}

	acceptSingleDot(style) {
		this.skipIndent()
		return this.pushStyleOnSuccess(this.readSingleDot(), style)
	}

	acceptNumber(style) {
		this.skipIndent()
		return this.pushStyleOnSuccess(this.readNumber(), style)
	}

	acceptIdentifier(style) {
		this.skipIndent()
		return this.pushStyleOnSuccess(this.readIdentifier(), style)
	}

	acceptTextLiteral(style) {
		this.skipIndent()
		return this.pushStyleOnSuccess(this.readTextLiteral(), style)
	}
}
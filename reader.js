class Reader {
	constructor() {
		this.NON_OPERATORS = /[^ \n+\-*\/()\[\]%&#\$,.^:=]/
	}

	reset(source) {
		this.source = source

		this.readerCache = {
			previous: null,
			value: null,
			index: 0
		}
	}

	stepIn() {
		this.readerCache = {
			previous: this.readerCache,
			value: this.readerCache.value,
			index: this.readerCache.index
		}
	}

	drop() {
		this.readerCache = this.readerCache.previous
		return false
	}

	apply() {
		this.readerCache.previous = this.readerCache.previous.previous
		return true
	}

	get value() {
		return this.readerCache.value
	}

	set value(value) {
		this.readerCache.value = value
	}

	get index() {
		return this.readerCache.index
	}

	set index(index) {
		this.readerCache.index = index
	}

	hasNext() {
		return this.index < this.source.length
	}

	hasSomeSpace() {
		return this.source[this.index] === '\n' ||
			this.source[this.index] === ' '
	}

	read(token) {
		for (let offset = 0; offset < token.length; offset++)
			if (this.source[this.index + offset] !== token[offset])
				return false

		this.index += token.length
		this.value = token
		return true
	}

	readNonBlank() {
		if (!this.hasNext() || this.hasSomeSpace())
			return false

		this.value = this.source[this.index++]

		while (this.hasNext() && !this.hasSomeSpace())
			this.value += this.source[this.index++]

		return true
	}

	readLine() {
		if (
			!this.hasNext() ||
			this.source[this.index] === '\n'
		) return false

		this.value = this.source[this.index++]

		while (
			this.hasNext() &&
			this.source[this.index] !== '\n'
		) this.value += this.source[this.index++]

		return true
	}

	readMonotonous(regex) {
		if (
			!this.hasNext() ||
			!regex.test(this.source[this.index])
		) return false

		this.value = this.source[this.index++]

		while (
			this.hasNext() &&
			regex.test(this.source[this.index])
		) this.value += this.source[this.index++]

		return true
	}

	readEnd() {
		return this.readMonotonous(this.NON_OPERATORS)
	}

	readKeyword(token) {
		this.stepIn()

		if (!this.read(token))
			return this.drop()

		if (this.readEnd())
			return this.drop()

		return this.apply()
	}

	readNonZeroMonotonous(regex) {
		if (this.read('0'))
			return true
		return this.readMonotonous(regex)
	}

	readBinary() {
		return this.readNonZeroMonotonous(/[01]/)
	}

	readOctal() {
		return this.readNonZeroMonotonous(/[0-7]/)
	}

	readDecimal() {
		return this.readNonZeroMonotonous(/[0-9]/)
	}

	readHexadecimal() {
		return this.readNonZeroMonotonous(/[0-9a-fA-F]/)
	}

	readSignedDecimal() {
		this.stepIn()
		let sign = ''

		if (this.read('-') || this.read('+'))
			sign = this.value

		if (!this.readDecimal())
			return this.drop()

		this.value = sign + this.value
		return this.apply()
	}

	readSingleDot() {
		this.stepIn()

		if (!this.read('.'))
			return this.drop()

		if (this.read('.'))
			return this.drop()

		return this.apply()
	}

	readDouble() {
		this.stepIn()

		let power = null
		let frac = null
		let int = null

		if(this.readDecimal())
			int = this.value

		if (this.readSingleDot()) {
			if (!this.readMonotonous(/[0-9]/))
				return this.drop()

			frac = '.' + this.value
		}

		if (this.read('e') || this.read('E')) {
			const e = this.value

			if (!this.readSignedDecimal())
				return this.drop()

			power = e + this.value
		}

		if (!int && !frac)
			return this.drop()

		this.value = (int || '0') + (frac || '') + (power || '')
		return this.apply()
	}

	readNumber() {
		this.stepIn()

		let number = null

		if (this.read('%')) {
			if (!this.readBinary())
				return this.drop()
			number = '%' + this.value

		} else if (this.read('&')) {
			if (!this.readOctal())
				return this.drop()
			number = '&' + this.value

		} else if (this.read('$')) {
			if (!this.readHexadecimal())
				return this.drop()
			number = '$' + this.value

		} else if (this.readDouble()) {
			number = this.value

		} else {
			return this.drop()
		}

		if (this.readEnd())
			return this.drop()

		this.value = number
		return this.apply()
	}

	readIdentifier() {
		this.stepIn()

		if (this.readMonotonous(/[0-9]/))
			return this.drop()

		if (!this.readMonotonous(/[a-zA-Z0-9_]/))
			return this.drop()

		if (this.readEnd())
			return this.drop()

		return this.apply()
	}

	readTextLiteral() {
		this.stepIn()

		if (this.read('#')) {
			if (!this.readDecimal())
				return this.drop()

			this.value = '#' + this.value
			return this.apply()
		}

		if (!this.read('\'') && !this.read('"'))
			return this.drop()

		const quote = this.value
		let out = quote

		while (
			this.hasNext() &&
			this.source[this.index] !== quote
		) {
			if (this.source[this.index] === '\\')
				out += this.source[this.index++]
			out += this.source[this.index++]
		}

		if (!this.read(quote) || this.readEnd())
			return this.drop()

		this.value = out + quote
		return this.apply()
	}
}
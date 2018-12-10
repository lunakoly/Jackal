class Terminal {
	constructor(value, style) {
		this.value = value
		this.style = style
	}

	toString() {
		return Formatter.style(Formatter.escape(this.value), this.style)
	}
}

class Prefix {
	constructor(target, operator) {
		this.operator = operator
		this.target = target
	}

	toString() {
		if (
			this.target instanceof Binary ||
			this.target instanceof Prefix
		) return this.operator + '(' + this.target + ')'
		return this.operator + this.target
	}
}

class Postfix {
	constructor(target, operator) {
		this.operator = operator
		this.target = target
	}

	toString() {
		if (this.target instanceof Binary)
			return '(' + this.target + ')' + this.operator
		return this.target + this.operator
	}
}

class Collection {
	constructor(target, kind) {
		this.target = target
		this.kind = kind
	}

	toString() {
		return this.kind + Formatter.keyword(' of ') + this.target
	}
}

class Group {
	constructor(target) {
		this.target = target
	}

	toString() {
		return '(' + this.target + ')'
	}
}

class Binary {
	constructor(first, second, operator, precedence) {
		this.precedence = precedence
		this.operator = operator
		this.second = second
		this.first = first
	}

	toString() {
		let second = this.second
		let first = this.first

		if (
			this.first instanceof Binary &&
			this.first.precedence < this.precedence
		) first = '(' + first + ')'

		if (
			this.second instanceof Binary &&
			this.second.precedence <= this.precedence
		) second = '(' + second + ')'

		return first + ' ' + this.operator + ' ' + second
	}
}

class Range {
	constructor(first, second) {
		this.second = second
		this.first = first
	}

	toString() {
		return this.first + '..' + this.second
	}
}

class Parameters {
	constructor(... items) {
		this.items = items
	}

	toString() {
		return this.items.join(', ')
	}
}

class FunctionCall {
	constructor(target, params) {
		this.target = target
		this.params = params
	}

	toString() {
		return this.target + '(' + this.params + ')'
	}
}

class ArrayCall {
	constructor(target, params) {
		this.target = target
		this.params = params
	}

	toString() {
		return this.target + '[' + this.params + ']'
	}
}

class FieldCall {
	constructor(target, field) {
		this.target = target
		this.field = field
	}

	toString() {
		return this.target + '.' + this.field
	}
}

class Declaration {
	constructor(modifier, type, value, ...identifiers) {
		this.identifiers = identifiers
		this.modifier = modifier
		this.value = value
		this.type = type
	}

	toString() {
		let out = this.identifiers.join(', ')

		if (this.modifier)
			out = this.modifier + ' ' + out

		if (this.type)
			out += ': ' + this.type

		if (this.value)
			out += ' = ' + this.value

		return out
	}
}

class Scope {
	constructor(parent, namespace, commands) {
		this.namespace = namespace
		this.commands = commands
		this.parent = parent
	}

	resolve(identifier) {
		if (this.namespace && this.namespace[identifier])
			return this.namespace[identifier]

		if (this.parent)
			return this.parent.resolve(identifier)

		return 'unknown'
	}

	setProgram(name) {
		if (this.parent)
			this.parent.setProgram(name)
	}

	addConst(declaration) {
		if (this.parent)
			this.parent.addConst(declaration)
	}

	addType(declaration) {
		if (this.parent)
			this.parent.addType(declaration)
	}

	addVar(declaration) {
		if (this.parent)
			this.parent.addVar(declaration)
	}

	addFun(declaration) {
		if (this.parent)
			this.parent.addFun(declaration)
	}
}

class Block extends Scope {
	constructor(parent, indentLevel = 0) {
		super(parent, null, [])
		this.indentLevel = indentLevel
	}

	getEndIndent() {
		if (this.commands.length === 1)
			return '\n' + '\t'.repeat(this.indentLevel)
		return ' '
	}

	toString() {
		const indent = '\t'.repeat(this.indentLevel + 1)

		if (this.commands.length === 1)
			return '\n' + indent + this.commands[0]

		const endIndent = '\t'.repeat(this.indentLevel)

		return Formatter.keyword('begin') + '\n' +
				this.commands.map(it => indent + it + ';').join('\n') + '\n' +
				endIndent + Formatter.keyword('end')
	}
}

class WithBlock extends Block {
	resolve(identifier) {
		let resolved = null

		if (this.namespace && this.namespace[identifier])
			resolved = this.namespace[identifier]

		else if (this.parent)
			resolved = this.parent.resolve(identifier)

		if (resolved === 'unknown')
			return 'variable-unproven'

		return resolved
	}
}

class Space extends Scope {
	constructor(parent) {
		super(parent, {}, [])

		this.indentLevel = 0
		this.consts = []
		this.types = []
		this.vars = []
	}

	addConst(declaration) {
		this.consts.push(declaration)
	}

	addType(declaration) {
		this.types.push(declaration)
	}

	addVar(declaration) {
		this.vars.push(declaration)
	}

	toString() {
		const indent = '\t'.repeat(this.indentLevel + 1)
		const endIndent = '\t'.repeat(this.indentLevel)

		return Formatter.keyword('begin') + '\n' +
				this.commands.map(it => indent + it + ';').join('\n') + '\n' +
				endIndent + Formatter.keyword('end')
	}
}

class Fun extends Space {
	constructor(parent) {
		super(parent)

		this.args = []
		this.name = null
		this.returnType = null

		this.namespace['result'] = 'variable'
	}

	toString() {
		let out = this.name + '(' + this.args.join('; ') + ')'

		if (this.returnType)
			out = Formatter.keyword('function ') + out + ': ' + this.returnType + ';\n'
		else
			out = Formatter.keyword('procedure ') + out + ';\n'

		if (this.consts.length > 0)
			out += Formatter.representDeclarationList('const', this.consts) + '\n'

		if (this.types.length > 0)
			out += Formatter.representDeclarationList('type', this.types) + '\n'

		if (this.vars.length > 0)
			out += Formatter.representDeclarationList('var', this.vars) + '\n'

		return out + super.toString() + ';'
	}
}

const BUILT_INS = new Scope(null, {
	'boolean': 'type',
	'integer': 'type',
	'string': 'type',
	'real': 'type',
	'char': 'type',

	'false': 'boolean',
	'true': 'boolean',

	'write': 'function',
	'writeln': 'function',
	'exit': 'function',
	'read': 'function',
	'readln': 'function'
}, null)

class Program extends Space {
	constructor() {
		super(BUILT_INS)

		this.name = name
		this.funs = []
	}

	setProgram(name) {
		this.name = name
	}

	addFun(declaration) {
		this.funs.push(declaration)
	}

	toString() {
		let out = ''

		if (this.name)
			out += Formatter.keyword('program ') + this.name + ';\n\n'

		if (this.consts.length > 0)
			out += Formatter.representDeclarationList('const', this.consts) + '\n\n'

		if (this.types.length > 0)
			out += Formatter.representDeclarationList('type', this.types) + '\n\n'

		if (this.vars.length > 0)
			out += Formatter.representDeclarationList('var', this.vars) + '\n\n'

		if (this.funs.length > 0)
			out += this.funs.map(it => it.toString()).join('\n\n') + '\n\n'

		return out + super.toString() + '.'
	}
}

class IfStatement {
	constructor() {
		this.condition = null
		this.onFalse = null
		this.onTrue = null
	}

	toString() {
		let out = Formatter.keyword('if ') + this.condition + Formatter.keyword(' then') + ' '

		out += this.onTrue.toString()

		if (!this.onFalse)
			return out

		return out + this.onTrue.getEndIndent() + Formatter.keyword('else') + ' ' + this.onFalse.toString()
	}
}

class WhileStatement {
	constructor() {
		this.condition = null
		this.block = null
	}

	toString() {
		let out = Formatter.keyword('while ') + this.condition + Formatter.keyword(' do') + ' '
		return out + this.block.toString()
	}
}

class ForStatement {
	constructor() {
		this.iterator = null
		this.towards = true
		this.block = null
		this.from = null
		this.to = null
	}

	toString() {
		let out = Formatter.keyword('for ') + this.iterator + ' := ' +
				this.from + ' ' + Formatter.keyword(this.towards ? 'to' : 'downTo') + ' ' +
				this.to + ' ' + Formatter.keyword('do') + ' ' + this.block.toString()
		return out
	}
}

class WithStatement {
	constructor() {
		this.target = null
		this.block = null
	}

	toString() {
		let out = Formatter.keyword('with ') + this.target + ' ' +
				Formatter.keyword('do') + ' ' + this.block.toString()
		return out
	}
}

class RepeatStatement {
	constructor() {
		this.condition = null
		this.block = null
	}

	toString() {
		const indent = '\t'.repeat(this.block.indentLevel + 1)
		const endIndent = '\t'.repeat(this.block.indentLevel)
		const commands = this.block.commands.map(it => indent + it + ';').join('\n')

		let out = Formatter.keyword('repeat') + '\n' + commands + '\n' + endIndent +
				Formatter.keyword('until') + ' ' + this.condition.toString()
		return out
	}
}




/*


-100
-aaa

aaa[i]
'text'[i]

aaa()()
(...)()

@a^


var a: string[20]^ array


PRECEDENCE:
0: ==, <>, <=, >=, <, >
1: +, -, or, xor
2: *, /, div, mod, <<, and, shl, shr, >>, as






program CpCv

const
    c = 3E+8 * 3[]
    PI = 3.14

type
    L = K
    J = H

awdad

fun g(
    var i: integer,
    r: real, const s: real): ^string[10]
    type
        O = P
    var R = O + i * r - s

fun h()
    type
        int = integer
        H = B
    var t: O = 1

type List= string.Type[20] array[1..10, a..b]
var myList : List
         s   :     LolKek
  =     'Hello'
    l: int = 10 ** c

error_text







program CpCv

const c = 3E+8 PI = 3.14
type int = integer


fun pow(a: real, b: real): real
    pow = a ** b

fun inc(var value: integer)
    const step = 3
    value += step


var a: real = 5.0
var b: real = 2.7
writeln('5^2 = ', pow(a, b))

var alpha: int
alpha = 3
inc(alpha)
writeln('alpha = ', alpha)











program CpCv

const c = 3E+8 PI = 3.14
type int = integer


fun pow(a: real, b: real): real
    pow = a ** b

fun inc(var value: integer)
    const step = 3
    if a
        if b
            do()
        else if c
            did()
            dids = 1
        else
            done()
    else
        nothing()


var a, c: real = 5.0
var b: real = 2.7
writeln('5^2 = ', pow(a, b))

var alpha: int
alpha = 3
inc(alpha)
writeln('alpha = ', alpha)

 dwa anw ai

if good doGood()
if a
    if b
        do()
    else if c
        did()
    else
        done()
else
    nothing()
    something()

repeat
    shit staff()
    fuk
until allSHitIsCleared

const c = 10
var a = 1

fun sqr(x: real): real = x * x

fun p()
    const u = 10
    with u say(hi) sayBye = 1
    return u ** 2
    for i=0 to 10 stop() shit=1 for j=1 downTo 0 a
    while i > 0 fuck()
        cock while j < k shit

    while i > 0 fuck()
        cock while j < k shit

var input: real
readln(input)
writeln('Input^2 = ', sqr(input))var a, c: real = 5.0
var b: real = 2.7
writeln('5^2 = ', pow(a, b))

var alpha: int
alpha = 3
inc(alpha)
writeln('alpha = ', alpha)

if good doGood()
if a
    if b
        do()
    else if c
        did()
    else
        done()
else
    nothing()
    something()

repeat
    shit staff()
    fuk
until allSHitIsCleared

const c = 10
var a = 1

fun sqr(x: real): real = x * x

fun p()
    const u = 10
    with u say(hi) sayBye = 1
    return u ** 2
    for i=0 to 10 stop() shit=1 for j=1 downTo 0 a
    while i > 0 fuck()
        cock while j < k shit

    while i > 0 fuck()
        cock while j < k shit

var input: real
readln(input)
writeln('Input^2 = ', sqr(input))

*/
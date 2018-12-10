const decoratedOutput   = document.getElementById('decorated-output')
const decoratedInput    = document.getElementById('decorated-input')
const rawInput          = document.getElementById('raw-input')

const parser = new Parser()

rawInput.addEventListener('input', e => {
    const expression = parser.parse(rawInput.value)

    // console.log(expression)

    decoratedOutput.innerHTML = expression.toString()
    decoratedInput.innerHTML = Formatter.restructure(parser.styledSource)

    rawInput.style.height = decoratedInput.clientHeight
    rawInput.style.width  = decoratedInput.clientWidth
})


const Formatter = {
	restructure(text) {
	    return text
		        .split('\n')
		        .map(it => '<div>' + it + '</br></div>')
		        .join('')
	},

	escape(text) {
		return text
				.replace(/&/g, '&amp;')
		        .replace(/</g, '&lt;')
		        .replace(/>/g, '&gt;')
	},

	clear(text) {
		return text
				.replace(/\r/g, '')
				.replace(/\t/g, '    ')
	},

	style(token, style) {
		return `<span class="${style}">${token}</span>`
	},

	keyword(token) {
		return `<span class="keyword">${token}</span>`
	},

	representDeclarationList(name, list) {
		return Formatter.keyword(name) + '\n' + list.map(it => '\t' + it.toString() + ';').join('\n')
	}
}

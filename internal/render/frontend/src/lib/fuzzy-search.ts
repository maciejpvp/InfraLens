export const normalizeSearch = (value: string) =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export const searchWords = (value: string) => [...new Set([
  ...normalizeSearch(value).split(' '),
  ...normalizeSearch(value.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')).split(' '),
])].filter(Boolean)

const oneEditApart = (term: string, word: string) => {
  if (Math.abs(term.length - word.length) > 1) return false
  if (term.length > word.length) return oneEditApart(word, term)
  let i = 0
  while (i < term.length && term[i] === word[i]) i++
  if (term.length < word.length) return term.slice(i) === word.slice(i + 1)
  const rest = term.slice(i + 1)
  return rest === word.slice(i + 1)
    || (term[i] === word[i + 1] && term[i + 1] === word[i] && term.slice(i + 2) === word.slice(i + 2))
}

const wordRank = (term: string, word: string) => {
  if (word === term) return 0
  if (word.startsWith(term)) return 1
  if (word.includes(term)) return 2
  return term.length >= 4 && oneEditApart(term, word) ? 3 : Infinity
}

export const searchRank = ({ name, fields }: { name: string; fields: string[][] }, query: string, terms: string[]) => {
  if (!query) return 0
  if (name === query) return -2
  if (name.startsWith(query)) return -1
  let score = 0
  for (const term of terms) {
    let best = Infinity
    for (const [field, words] of fields.entries()) {
      for (const word of words) best = Math.min(best, wordRank(term, word) * fields.length + field)
      if (best === 0) break
    }
    if (best === Infinity) return Infinity
    score += best
  }
  return score
}

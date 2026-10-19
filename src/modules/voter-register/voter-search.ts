import type { VoterRecord } from './types'

const independentVowels: Record<string, string> = {
  అ: 'a', ఆ: 'aa', ఇ: 'i', ఈ: 'ii', ఉ: 'u', ఊ: 'uu', ఋ: 'ru', ఎ: 'e', ఏ: 'ee', ఐ: 'ai', ఒ: 'o', ఓ: 'oo', ఔ: 'au',
}

const consonants: Record<string, string> = {
  క: 'k', ఖ: 'kh', గ: 'g', ఘ: 'gh', ఙ: 'ng', చ: 'ch', ఛ: 'chh', జ: 'j', ఝ: 'jh', ఞ: 'ny', ట: 't', ఠ: 'th', డ: 'd', ఢ: 'dh', ణ: 'n', త: 't', థ: 'th', ద: 'd', ధ: 'dh', న: 'n', ప: 'p', ఫ: 'ph', బ: 'b', భ: 'bh', మ: 'm', య: 'y', ర: 'r', ల: 'l', వ: 'v', శ: 'sh', ష: 'sh', స: 's', హ: 'h', ళ: 'l', ఱ: 'r',
}

const vowelSigns: Record<string, string> = {
  'ా': 'aa', 'ి': 'i', 'ీ': 'ii', 'ు': 'u', 'ూ': 'uu', 'ృ': 'ru', 'ె': 'e', 'ే': 'ee', 'ై': 'ai', 'ొ': 'o', 'ో': 'oo', 'ౌ': 'au',
}

export function normalizeSearchText(value: string) {
  return value.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '')
}

export function romanizeTelugu(value: string) {
  const characters = Array.from(value)
  let output = ''
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]
    const consonant = consonants[character]
    if (consonant) {
      const next = characters[index + 1]
      if (next === '్') {
        output += consonant
        index += 1
      } else if (next && vowelSigns[next]) {
        output += consonant + vowelSigns[next]
        index += 1
      } else {
        output += consonant + 'a'
      }
      continue
    }
    if (independentVowels[character]) output += independentVowels[character]
    else if (character === 'ం') output += 'm'
    else if (character === 'ః') output += 'h'
    else if (character !== '్' && !vowelSigns[character]) output += character
  }
  return output
}

function canonicalRoman(value: string) {
  return normalizeSearchText(value)
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'e')
    .replace(/ii/g, 'i')
    .replace(/oo/g, 'o')
    .replace(/uu/g, 'u')
}

function consonantSignature(value: string) {
  return canonicalRoman(value).replace(/[aeiou]/g, '')
}

export function matchesVoterSearch(record: VoterRecord, query: string) {
  const cleanQuery = normalizeSearchText(query)
  if (!cleanQuery) return true
  const rawFields = [
    record.fullName, record.relativeName, record.relationshipType, record.age, record.gender, record.doorNumber,
    record.voterId, record.alternateIdentifier, record.mobile, record.serialNumber, record.assemblySerial,
    record.wardId, record.boothId, record.area, record.division, record.sourcePdfName, record.sourcePdfId, record.uploadedBy,
  ]
  if (rawFields.some((value) => normalizeSearchText(value).includes(cleanQuery))) return true

  const romanQuery = canonicalRoman(query)
  if (romanQuery.length < 2) return false
  const romanizedNames = [record.fullName, record.relativeName].map((value) => canonicalRoman(romanizeTelugu(value)))
  if (romanizedNames.some((value) => value.includes(romanQuery))) return true

  // Telugu OCR often adds the final inherent "a" sound. Comparing the
  // consonant pattern also lets "ramesh" find "రమేష్" and similar names
  // without requiring the user to type the exact Telugu spelling.
  const queryConsonants = consonantSignature(romanQuery)
  return queryConsonants.length >= 3 && romanizedNames.some((value) => consonantSignature(value).includes(queryConsonants))
}

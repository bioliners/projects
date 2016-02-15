'use strict'

// Core node libraries
let assert = require('assert'),
	crypto = require('crypto')

module.exports =
class Seq {
	constructor(optSequence, optDontClean) {
		this.sequence_ = optSequence || ''
		this.isCircular_ = false
		if (!optDontClean)
			this.clean_()
	}

	complement() {
		throw new Error('Not yet implemented')
	}

	invalidSymbol() {
		return '@'
	}

	isCircular() {
		return this.isCircular_
	}

	isEmpty() {
		return this.length() === 0
	}

	isValid() {
		return this.sequence_.indexOf('@') === -1
	}

	length() {
		return this.sequence_.length
	}

	reverseComplement() {
		throw new Error('Not yet implemented')
	}

	sequence() {
		return this.sequence_
	}

	seqId() {
		let md5base64 = crypto.createHash('md5').update(this.sequence_).digest('base64')
		return md5base64.replace(/=+/g, '')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
	}

	setCircular(optCircular) {
		this.isCircular_ = optCircular === undefined ? true : !!optCircular
		return this
	}

	subseq(start, stop) {
		assert(start > 0, 'start must be positive')
		assert(stop > 0, 'stop must be positive')
		assert(start <= this.length(), 'start must be <= length')
		assert(stop <= this.length(), 'stop must be <= length')
	
		if (!this.isCircular_ || start <= stop) {
			assert(start <= stop, 'start must be <= stop on non-circular sequences')
			return new Seq(this.oneBasedSubstr_(start, stop), true /* don't clean */)
		}

		// Circular sequence and the start is > stop
		return new Seq(this.oneBasedSubstr_(start, this.length()) +
			this.oneBasedSubstr_(1, stop), true /* don't clean */)
	}

	// ----------------------------------------------------
	// Private methods
	clean_() {
		this.sequence_ = this.sequence_
			.replace(/\s+/g, '')
			.replace(/\W|\d|_/g, '@')
			.toUpperCase()
	}

	oneBasedSubstr_(start, stop) {
		return this.sequence_.substr(start - 1, stop - start + 1)
	}
}

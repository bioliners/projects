/**
 * Parses feature locations typically associated with GenBank records. The resulting Location
 * object may be paired with a source DNA sequence to produce the source transcript.
 *
 * Locations vary in complexity from single bases to multiple transformations of join, complement,
 * order, etc. The location string is first parsed into a tree representation and then traversed
 * to produce a single location object representing this location string.
 */
'use strict'

// Core
const assert = require('assert')

// Local
const LocationPoint = require('./LocationPoint'),
	BetweenLocationPoint = require('./BetweenLocationPoint'),
	FuzzyLocationPoint = require('./FuzzyLocationPoint'),
	BoundedLocationPoint = require('./BoundedLocationPoint'),
	Location = require('./Location'),
	ComplementLocation = require('./ComplementLocation'),
	JoinLocation = require('./JoinLocation'),
	ArrayLocation = require('./ArrayLocation')

// --------------------------------------------------------
// --------------------------------------------------------
// Private helper classes - these are not exported
/**
 * Generic tree node.
 */
class Node {
	constructor() {
		this.parent_ = null
		this.children_ = []
	}

	location() {
		assert(this.hasChildren())
		assert(this.isRoot())
		return this.children_[0].location()
	}

	parent() {
		return this.parent_
	}

	push(childNode) {
		assert(childNode !== this)
		childNode.parent_ = this
		this.children_.push(childNode)
	}

	hasChildren() {
		return this.children_.length > 0
	}

	isLeaf() {
		return !this.hasChildren()
	}

	isRoot() {
		return this.parent_ === null
	}

	children() {
		return this.children_
	}
}

/**
 * Represents the complement of one and only one child location.
 */
class ComplementNode extends Node {
	location() {
		assert(this.children().length === 1, 'complement nodes must have one and only have one child')
		return new ComplementLocation(this.children()[0].location())
	}

	push(childNode) {
		if (this.hasChildren())
			throw new Error('complement nodes may only have one child')

		super.push(childNode)
	}
}

/**
 * Represents the join operator of one or multiple child locations.
 */
class JoinNode extends Node {
	location() {
		assert(this.hasChildren(), 'join nodes must have at least one child')
		let locations = this.children().map((childNode) => childNode.location())
		return new JoinLocation(locations)
	}
}

class OrderNode extends Node {
	location() {
		assert(this.hasChildren(), 'order nodes must have at least one child')
		let locations = this.children().map((childNode) => childNode.location())
		return new JoinLocation(locations)
		//         ^^^^^^^^^^^^ Not technically correct, but there is virtually no documentation
		// discussing how to deal properly with order() operators in the feature table. For
		// example, take the following annotation:
		//
		//      gene            order(147423..148106,148108..149580)
		//                      /locus_tag="BN112_0149"
		//                      /old_locus_tag="BB253_0149"
		//                      /pseudo
		//                      /db_xref="GeneID:13977207"
		//
		// From inspecting the sequence at GenBank, it appears like they treat it just like a
		// join. For those reasons, we use a JoinLocation here.
	}
}

/**
 * Represents a simple location, which does not have any children.
 */
class LocationNode extends Node {
	constructor(location) {
		super()
		this.location_ = location
	}

	push(childNode) {
		throw new Error('location nodes may not have children')
	}

	location() {
		return this.location_
	}
}
// --------------------------------------------------------
// --------------------------------------------------------

module.exports =
class LocationStringParser {
	/**
	 * @param {string} locationString string representation of a location (e.g. 'join(12..34)')
	 * @returns {AbstractLocation} root location node
	 */
	parse(locationString) {
		let root = new Node('root')
		this.recursivelyParse_(locationString, root)
		return root.location()
	}

	// ----------------------------------------------------
	// Private methods
	recursivelyParse_(locationString, parentNode) {
		if (/^complement\(/.test(locationString)) {
			let node = new ComplementNode()
			parentNode.push(node)
			this.recursivelyParse_(locationString.substr('complement('.length), node)
		}
		else if (/^join\(/.test(locationString)) {
			let node = new JoinNode()
			parentNode.push(node)
			this.recursivelyParse_(locationString.substr('join('.length), node)
		}
		else if (/^order\(/.test(locationString)) {
			let node = new OrderNode()
			parentNode.push(node)
			this.recursivelyParse_(locationString.substr('order('.length), node)
		}
		else if (locationString[0] === ',') {
			this.recursivelyParse_(locationString.substr(1), parentNode)
		}
		else if (locationString[0] === ')') {
			this.recursivelyParse_(locationString.substr(1), parentNode.parent())
		}
		else {
			let matches = /^(?:([A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?):)?([<>0-9.^]+?)([,)]|$)/.exec(locationString)
			//                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^     ^^^^^^^^^^^  ^^^^^^
			//                  1. optional accession                         2. location  3. end character
			if (!matches)
				return

			let totalMatchLength = matches[0].length,
				accession = matches[1],
				locationText = matches[2],
				endCharacter = matches[3],
				remainingLocationString = locationString.substr(totalMatchLength),
				location = this.parseLocation_(locationText, accession)

			if (!location)
				throw new Error()

			parentNode.push(new LocationNode(location))

			// parentNode.addLocation(location)
			if (endCharacter === ')')
				this.recursivelyParse_(remainingLocationString, parentNode.parent())
			else if (endCharacter === ',')
				this.recursivelyParse_(remainingLocationString, parentNode)
		}
	}

	parseLocation_(locationText, optAccession) {
		const parts = locationText.split('..')
		let startLocationPoint = this.parseLocationPoint_(parts[0])
		if (!startLocationPoint)
			return null

		let stopLocationPoint
		if (parts.length > 1) {
			stopLocationPoint = this.parseLocationPoint_(parts[1])
		} else if (startLocationPoint.hasDefiniteStart() && startLocationPoint.hasDefiniteStop()) {
			stopLocationPoint = startLocationPoint
		} else if (startLocationPoint.hasDefiniteStart()) {
			// e,g, <10
			stopLocationPoint = new LocationPoint(startLocationPoint.lowerBound())
		} else if (startLocationPoint.hasDefiniteStop()) {
			// e.g. >10
			stopLocationPoint = startLocationPoint
			startLocationPoint = new LocationPoint(stopLocationPoint.upperBound())
		}

		if (startLocationPoint && stopLocationPoint)
			return new Location(startLocationPoint, stopLocationPoint, optAccession)

		return null
	}

	parseLocationPoint_(locationPointText) {
		// Single base location: 345
		if (/^\d+$/.test(locationPointText))
			return new LocationPoint(parseInt(locationPointText))

		// 102.110 or 123^124
		if (/^\d+[.^]\d+$/.test(locationPointText)) {
			const isBetween = locationPointText.indexOf('^') >= 0
			const positions = locationPointText.split(/[.^]/)

			positions[0] = parseInt(positions[0])
			positions[1] = parseInt(positions[1])

			return isBetween ?
				new BetweenLocationPoint(positions[0], positions[1]) :
				new BoundedLocationPoint(positions[0], positions[1])
		}

		// <123 or >123
		if (/^[<>]\d+$/.test(locationPointText))
			return new FuzzyLocationPoint(locationPointText[0], parseInt(locationPointText.substr(1)))

		return null
	}
}

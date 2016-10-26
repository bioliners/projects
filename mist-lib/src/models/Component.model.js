'use strict'

module.exports = function(Sequelize, models, extras) {
	let fields = {
		genome_id: Object.assign(extras.requiredPositiveInteger(), {
			description: 'foreign identifier to this component\'s associated genome',
			example: 1
		}),
		accession: Object.assign(extras.requiredAccessionWithoutVersion(), {
			description: 'NCBI RefSeq replicon / contig accession number',
			example: 'NC_009634'
		}),
		version: Object.assign(extras.requiredPositiveInteger(), {
			description: 'NCBI RefSeq replicon / contig accession number and version suffix',
			example: 'NC_009634.1'
		}),
		version_number: Object.assign(extras.requiredPositiveInteger(), {
			description: 'NCBI RefSeq replicon / contig version',
			example: 1
		}),
		genbank_accession: Object.assign(extras.accessionWithoutVersion(), {
			description: 'cognate GenBank replicon / contig accession number',
			example: 'CP000742'
		}),
		genbank_version: Object.assign(extras.positiveInteger(), {
			description: 'cognate GenBank replicon /contig accession number and version suffix',
			example: 'CP000742.1'
		}),
		name: {
			type: Sequelize.TEXT,
			example: 'ANONYMOUS'
		},
		role: {
			type: Sequelize.TEXT,
			example: 'assembled-molecule'
		},
		assigned_molecule: {
			type: Sequelize.TEXT,
			description: 'associated biomolecule',
			example: 'na or pGOX5'
		},
		type: {
			type: Sequelize.TEXT,
			example: 'Chromosome'
		},
		genbank_refseq_relationship: {
			type: Sequelize.TEXT,
			description: 'relationship between the source GenBank record and the RefSeq annotation',
			example: '= or <>'
		},
		definition: {
			type: Sequelize.TEXT,
			description: 'brief description of this replicon / contig; sourced from the DEFINITION line(s)',
			example: 'Methanococcus vannielii SB, complete genome.'
		},
		molecule_type: {
			type: Sequelize.TEXT,
			description: 'type of molecule that was sequenced; sourced from the LOCUS line',
			example: 'DNA'
		},
		is_circular: {
			type: Sequelize.BOOLEAN,
			description: 'denotes if this replicon / contig is circular; sourced from the LOCUS line',
			example: 'true'
		},
		annotation_date: {
			type: Sequelize.DATE,
			description: 'date of the last modification; sourced from the LOCUS line',
			example: '2015-08-17'
		},
		comment: {
			type: Sequelize.TEXT,
			description: 'free-form comments'
		},
		dna: Object.assign(extras.requiredSequence(), {
			description: 'ungapped, capitalized DNA sequence'
		}),
		length: Object.assign(extras.requiredPositiveInteger(), {
			description: 'length of dna sequence',
			example: 1720048
		}),
		stats: {
			type: Sequelize.JSONB,
			allowNull: false,
			defaultValue: {},
			description: 'JSON object containing statistical data'
		}
	}

	let instanceMethods = {
		compoundAccession: function() {
			return this.accession + '.' + this.version
		}
	}

	let validate = {
		genbankAccessionVersion: extras.validate.bothNullOrBothNotEmpty('genbank_accession',
			'genbank_version'),
		dnaLength: extras.validate.referencedLength('length', 'dna')
	}

	// Prevent selection of the dna field. This avoids sending many megabytes of data in an
	// un-regulated manner.
	let excludedCriteriaAttributeSet = new Set(['dna']),
		criteriaAttributes = new Set(['id', ...Object.keys(fields)])
	for (let attribute of excludedCriteriaAttributeSet)
		criteriaAttributes.delete(attribute)
	criteriaAttributes = Array.from(criteriaAttributes)

	return {
		fields,
		params: {
			instanceMethods,
			classMethods: {
				/**
				 * @returns {Set.<String>}
				 */
				$excludedFromCriteria: function() {
					return excludedCriteriaAttributeSet
				},

				/**
				 * @returns {Array.<String>}
				 */
				$criteriaAttributes: function() {
					return criteriaAttributes
				}
			},
			validate
		}
	}
}

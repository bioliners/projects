'use strict'

// Local
const coreUtil = require('core-lib/util')

module.exports = function(Sequelize, models, extras) {
	const fields = {
		stable_id: Object.assign(extras.requiredText(), {
			description: 'permanent, universal gene identifier composed of the genome version and locus separated by a dash character',
			example: 'GCF_000302455.1-A994_RS01985',
		}),
		component_id: Object.assign(extras.requiredPositiveInteger(), {
			description: 'foreign identifier to this gene\'s component',
			example: 1
		}),
		dseq_id: extras.requiredDseqId(),
		aseq_id: extras.aseqId(),
		accession: Object.assign(extras.accessionWithoutVersion(), {
			description: 'NCBI RefSeq protein accession number',
			example: 'WP_004029586'
		}),
		version: Object.assign(extras.accessionVersion(), {
			description: 'NCBI RefSeq protein accession number and version suffix',
			example: 'WP_004029586.1'
		}),
		locus: Object.assign(extras.requiredText(), {
			description: 'submitter-supplied, systematic, stable identifier for a gene and its associated features',
			example: 'A994_RS01985'
		}),
		old_locus: {
			type: Sequelize.TEXT,
			description: 'previously annotated locus_tag; largely originated from RefSeq re-annotation project',
			example: 'A994_01955'
		},
		location: Object.assign(extras.requiredText(), {
			description: 'source region and operators encoding this gene',
			example: 'complement(417270..417881)'
		}),
		strand: Object.assign(extras.requiredDnaStrand(), {
			example: '-'
		}),
		start: Object.assign(extras.requiredPositiveInteger(), {
			description: '1-based; start position of gene regardless of the strand; always < stop unless gene spans origin',
			example: 417270
		}),
		stop: Object.assign(extras.requiredPositiveInteger(), {
			description: '1-based; stop position of gene regardless of the strand; always > start unless gene spans origin',
			example: 417881
		}),
		length: Object.assign(extras.requiredPositiveInteger(), {
			description: 'gene sequence length; typically equals stop - start + 1 except in cases where the gene spans the origin',
			example: 612
		}),
		names: Object.assign(extras.arrayWithNoEmptyValues(), {
			description: 'array of symbols of the gene corresponding to a sequence region',
			example: ['hisH'],
		}),
		pseudo: {
			type: Sequelize.BOOLEAN,
			description: 'if true, indicates this gene is a non-functional gene of sorts',
			example: 'false',
			allowNull: false,
			defaultValue: false,
			validate: {
				notEmpty: true
			}
		},
		notes: {
			type: Sequelize.TEXT
		},
		product: {
			type: Sequelize.TEXT,
			example: 'imidazole glycerol phosphate synthase, glutamine amidotransferase subunit',
			validate: {
				notEmpty: true
			}
		},
		codon_start: {
			type: Sequelize.INTEGER,
			description: '1-based offset at which the first complete codon may be found',
			example: 1,
			validate: {
				isInt: true,
				isIn: [[1, 2, 3]] // eslint-disable-line no-magic-numbers
			}
		},
		translation_table: {
			type: Sequelize.INTEGER,
			description: 'genetic code table used if other than universal genetic code table',
			example: 11,
			validate: {
				isInt: true,
				min: 1
			}
		},
		qualifiers: {
			type: Sequelize.JSONB,
			description: 'JSON object of other qualifiers associated with this gene',
			defaultValue: {}
		},
		cds_location: {
			type: Sequelize.TEXT,
			description: 'represents the source region and operators encoding the gene sequence of any associated CDS; usually identical to location',
			example: 'complement(417270..417881)'
		},
		cds_qualifiers: {
			type: Sequelize.JSONB,
			description: 'JSON object of CDS qualifiers associated with the CDS for this gene',
			example: '{"inference": "EXISTENCE: similar to AA sequence:RefSeq:WP_004029586.1"}',
			defaultValue: {}
		}
	}

	const validate = {
		accessionVersion: extras.validate.bothNullOrBothNotEmpty('accession', 'version')
	}

	const instanceMethods = {
		/**
		 * @param {Object?} [options = {}]
		 * @param {number?} [options.amount] default number of indices to include in both directions relative to ${index}
		 * @param {number?} [options.amountBefore = options.amount] number of indices to include that occur before ${index}
		 * @param {number?} [options.amountAfter = options.amount] number of indices to include that occur after ${index}
		 * @returns {Promise} array of id ranges; these are the primary gene identifier values - not alternate, public-facing identifiers
		 */
		findNeighborIds: function(options) {
			if (!this.component_id)
				return Promise.resolve([])

			return Promise.all([
				this.getComponent({
					attributes: ['is_circular'],
				}),
				models.Component.geneIdRange(this.component_id),
			])
			.then(([component, geneIdRange]) => {
				// If for some reason, component is not found, assume non-circular
				const isCircular = !!component && component.is_circular
				return coreUtil.findNeighoringIndices(this.id, geneIdRange[0], geneIdRange[1], isCircular, options)
			})
		}
	}

	return {
		fields,
		instanceMethods,
		params: {
			timestamps: false,
			validate,
		},
	}
}

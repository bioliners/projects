/* eslint-disable valid-jsdoc */

'use strict';

// Local
const AbstractSeqsService = require('./AbstractSeqsService');

module.exports =
class AseqsService extends AbstractSeqsService {
  /**
	 * @param {Array.<Seq>} seqs
	 * @param {Transaction} [transaction=null]
	 * @returns {Promise}
	 */
  insertIgnoreSeqs(seqs, transaction = null) {
    return super.insertIgnoreSeqs(seqs, ['id', 'length', 'sequence'], transaction);
  }
};

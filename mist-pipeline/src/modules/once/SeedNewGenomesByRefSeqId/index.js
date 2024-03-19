'use strict';

// Core
const { createReadStream } = require('fs');

// Vendor
const split = require('split');

// Local
const SeedNewGenomes = require('../SeedNewGenomes');

module.exports =
class SeedNewGenomesByRefSeqId extends SeedNewGenomes {
  static description() {
    return 'seed the database with specific RefSeq genomes sourced from NCBI';
  }

  static moreInfo() {
    return 'Specify a file containing NCBI RefSeq accessions (with version numbers)\n' +
      'to match using the query parameter\n' +
      '  -q <accession file>';
  }

  constructor(app) {
    super(app);

    this.seedConfig_ = this.config_.seedNewGenomesByRefSeqId;
    this.dataDir_ = __dirname;
    this.accessionFile_ = this.query_;
    this.queryVersions_ = new Set();
  }

  async run() {
    if (!this.accessionFile_) {
      throw new Error(`Invalid or missing accession file: ${this.accessionFile_}`);
    }
    await this.parseAccessionFile_();
    await super.run();
  }

  acceptGenome_(genomeData) {
    if (!genomeData) {
      return false;
    }

    return this.queryVersions_.has(genomeData.version);
  }

  parseAccessionFile_() {
    return new Promise((resolve, reject) => {
      const lineStream = createReadStream(this.accessionFile_);
      lineStream.on('error', reject);
      lineStream.pipe(split())
        .on('data', (line) => {
          const matches = /^\s*(\S+)/.exec(line);
          if (matches) {
            this.queryVersions_.add(matches[1]);
          }
        })
        .on('end', () => {
          if (this.queryVersions_.size > 0) {
            resolve();
          } else {
            reject(new Error(`No accessions found in accession file: ${this.accessionFile_}`));
          }
        });
    });
  }
};

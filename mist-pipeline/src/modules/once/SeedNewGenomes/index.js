/**
 * The SeedNewGenomes module handles downloading assembly summary files from NCBI, finding new
 * genomes not in the MiST database, and inserting these into the genomes table. Only those fields
 * contained in the summary file are are inserted. All other data (e.g. replicon metadata, DNA,
 * genes, etc.) are added with other modules.
 *
 * This module uses the following approach:
 * 1) Download the archaea and bacterial summary files from the NCBI FTP site (if they are not
 *    already on the filesystem and are younger than 24 hours)
 * 2) Read the entire assembly summary file into memory as an array of objects
 * 3) Create a temporary table for storing genome summaries
 * 4) Process the assembly summary file in batches. For each batch,
 *    a) start transaction
 *    b) load entire batch of summaries into the temporary table
 *    c) insert new genomes in temporary table but not in genomes table up to the maximum of
 *       the batch size or configured max number of genomes per run
 *    d) truncate temporary table
 *    e) commit transaction
 *
 * The temporary table is an optimization step. Prior efforts entailed querying the database for
 * each genome one at a time. From a remote connection, each of these queries took ~42ms (vs 1ms
 * locally). Even at 1ms, looping through 60,000 entries would still require a significant
 * amount of time. To mitigate this, a batch of summaries are loaded into the temporary table
 * and then left outer joined against the genomes table. Those records not already in the genomes
 * table are inserted. This drastically improved performance.
 */

'use strict';

// Core
const fs = require('fs');
const path = require('path');

// Vendor
const parse = require('csv-parse');
const pumpify = require('pumpify');
const split = require('split');
const streamEach = require('stream-each');
const through2 = require('through2');

// Local
const OncePipelineModule = require('lib/OncePipelineModule');
const generatorUtil = require('core-lib/generator-util');
const mutil = require('mist-lib/mutil');

// Constants
const kBatchSize = 50;
const kTempTableName = 'seed_new_genomes__summaries';
const kCreateTempTableSql = `CREATE TEMPORARY TABLE ${kTempTableName} (
	accession text not null,
	version text not null,
	version_number integer not null,
	genbank_accession text,
	genbank_version text,
	taxonomy_id integer,
	name text not null,
	refseq_category text,
	bioproject text,
	biosample text,
	wgs_master text,
	strain text,
	isolate text,
	version_status text,
	assembly_level text,
	release_type text,
	release_date date,
	assembly_name text,
	submitter text,
	ftp_path text,

	unique(accession, version)
)`;
const kTempTableFields = [
  'accession',
  'version',
  'version_number',
  'genbank_accession',
  'genbank_version',
  'taxonomy_id',
  'name',
  'refseq_category',
  'bioproject',
  'biosample',
  'wgs_master',
  'strain',
  'isolate',
  'version_status',
  'assembly_level',
  'release_type',
  'release_date',
  'assembly_name',
  'submitter',
  'ftp_path',
];

module.exports =
class SeedNewGenomes extends OncePipelineModule {
  static description() {
    return 'seed the database with genomes sourced from NCBI';
  }

  static moreInfo() {
    return 'Use the query parameter to only seed those genomes whose name\n' +
      'matches a regular expression. For example:\n' +
			'  -q "coli" will only match those genomes with "coli" in its name\n' +
			'  -q "^Escher" will only match those genomes whose name begins with "Escher"';
  }

  constructor(app) {
    super(app);

    this.seedConfig_ = this.config_.seedNewGenomes;
    this.numGenomesSeeded_ = 0;
    this.dataDir_ = __dirname;
    this.queryGenerator_ = this.models_.Genome.queryGenerator;
    this.queryRegex_ = this.query_ ? new RegExp(this.query_) : null;
  }

  optimize() {
    return this.analyze(this.models_.Genome.tableName);
  }

  async run() {
    for (const assemblyLink of this.seedConfig_.assemblySummaryLinks) {
      if (this.maximumGenomesSeeded_()) {
        return null;
      }

      const summaryFile = await this.downloadAssemblySummary_(assemblyLink);
      await this.processSummaryFile_(summaryFile);
    }
  }

  // ----------------------------------------------------
  // Private methods
  maximumGenomesSeeded_() {
    return this.seedConfig_.maxNewGenomesPerRun &&
			this.numGenomesSeeded_ >= this.seedConfig_.maxNewGenomesPerRun;
  }

  /**
	 * @param {String} link
	 * @returns {Promise}
	 */
  async downloadAssemblySummary_(link) {
    const destFile = path.resolve(this.dataDir_, link.fileName);
    const isYounger = await mutil.pathIsYoungerThan(destFile, this.seedConfig_.summaryFileDuration);
    if (isYounger) {
      this.logger_.info({path: destFile}, `Summary file already exists and is younger than ${this.seedConfig_.summaryFileDuration.humanize()}`);
      return destFile;
    }

    this.logger_.info({path: destFile}, `Downloading assembly summary: ${link.fileName}`);
    await mutil.download(link.url, destFile);
    this.logger_.info('Download finished');
    return destFile;
  }

  /**
	 * Processes the summary file {$file} for new genomes to insert into the database. If ${file}
	 * is null, then nothing is done.
	 *
	 * Because of special path conventions, all input values are initially preserved as strings
	 * rather than relying on the csv_parse.auto_parse option. This is to accommodate looking up
	 * paths on the NCBI FTP server where values like 1.0 or _05864 are converted to the numbers
	 * 1 and 5864, respectively. While apparently innocuous, this now resolves to an invalid
	 * lookup value on the FTP site.
	 *
	 * Examples:
	 * GCF_000261485.1	PRJNA224116	SAMN02469481	AJQT00000000.1	representative genome	716928	716925	Ensifer sojae CCBAU 05684	strain=CCBAU 05684		latest	Contig	Major	Full	2012/05/03	05684	China Agricultural University	GCA_000261485.1	identical	ftp://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/261/485/GCF_000261485.1_05684
	 *
	 * @param {String?} file
	 * @returns {Promise}
	 */
  async processSummaryFile_(file = null) {
    if (!file) {
      return null;
    }

    this.logger_.info({file}, 'Processing summary file');
    const parser = parse({
      columns: true,
      delimiter: '\t',
      trim: true,
      relax: true,
      skip_empty_lines: true,
      skip_lines_with_error: true,
      auto_parse: false,	// do not attempt to convert input strings to native types
    });

    const readStream = fs.createReadStream(file);
    // The assembly summary files have two header lines the first of which is merely
    // descriptive; however, it causes csv-parse to choke because it is looking for the
    // header line. Thus, this through stream skips the first line as well as re-appends the
    // newline character that is stripped by LineStream.
    let skippedFirstLine = false;
    const skipLineStream = through2.obj(function(line, encoding, done) {
      if (skippedFirstLine) {
        // The CSV parser expects input with newlines. Here we add them back because the
        // LineStream removes them.
        // eslint-disable-next-line no-invalid-this
        this.push(line + '\n');
      } else {
        skippedFirstLine = true;
      }
      done();
    });
    let numGenomeSummaries = 0;
    const genomeSummaries = [];

    await new Promise((resolve, reject) => {
      const pipeline = pumpify.obj(readStream, split(), skipLineStream, parser);
      streamEach(pipeline, (row, next) => {
        this.shutdownCheck_();
        const genomeData = this.genomeDataFromRow_(row);
        if (genomeData) {
          numGenomeSummaries++;
        }
        if (this.acceptGenome_(genomeData)) {
          genomeSummaries.push(genomeData);
        }
        next();
      }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    this.logger_.info(`Read ${numGenomeSummaries} genome summaries`);
    if (genomeSummaries.length) {
      this.logger_.info(`Matched ${genomeSummaries.length} genome summaries`);
    }

    await this.createTemporaryTable_();
    await this.insertNewGenomes_(genomeSummaries);
    await this.dropTemporaryTable_();
  }

  genomeDataFromRow_(row) {
    const refseqAccessionParts = mutil.parseAccessionVersion(row['#assembly_accession']);
    const genbankAccessionParts = mutil.parseAccessionVersion(row.gbrs_paired_asm);
    const genomeData = {
      accession: refseqAccessionParts[0],
      version: row['#assembly_accession'],
      version_number: refseqAccessionParts[1],
      genbank_accession: genbankAccessionParts[0],
      genbank_version: row.gbrs_paired_asm,
      taxonomy_id: Number(row.taxid),
      name: row.organism_name,
      refseq_category: row.refseq_category,
      bioproject: row.bioproject,
      biosample: row.biosample,
      wgs_master: row.wgs_master,
      strain: this.extractStrain_(row.infraspecific_name),
      isolate: row.isolate,
      version_status: row.version_status,
      assembly_level: row.assembly_level,
      release_type: row.release_type,
      release_date: row.seq_rel_date,
      assembly_name: row.asm_name,
      submitter: row.submitter,
      ftp_path: row.ftp_path,
    };

    for (let key in genomeData) {
      if (!genomeData[key]) {
        genomeData[key] = null;
      }
    }

    return genomeData;
  }

  extractStrain_(infraSpecificName) {
    const matches = /strain=(\S+)/.exec(infraSpecificName);
    return matches ? matches[1] : null;
  }

  acceptGenome_(genomeData) {
    if (!genomeData) {
      return false;
    }

    const {refseq_category: refSeqCategory} = genomeData;
    const isRepRefGenome = refSeqCategory === 'representative genome' || refSeqCategory === 'reference genome';
    return isRepRefGenome && this.matchesQuery_(genomeData.name);
  }

  matchesQuery_(name) {
    return !this.queryRegex_ || this.queryRegex_.test(name);
  }

  createTemporaryTable_() {
    return this.sequelize_.query(kCreateTempTableSql);
  }

  async insertNewGenomes_(genomeSummaries) {
    for (const genomeSummariesBatch of generatorUtil.batch(genomeSummaries, kBatchSize)) {
      this.shutdownCheck_();
      await this.sequelize_.transaction(async (transaction) => {
        await this.bulkInsertGenomeSummaries_(genomeSummariesBatch, transaction);
        await this.addNewGenomes_(transaction);
        await this.truncateTemporaryTable_(transaction);
      });

      if (this.maximumGenomesSeeded_()) {
        return;
      }
    }
  }

  bulkInsertGenomeSummaries_(genomeSummaries, transaction) {
    const sql = this.queryGenerator_.bulkInsertQuery(
      kTempTableName,
      genomeSummaries,
      {fields: kTempTableFields},
      kTempTableFields,
    );

    return this.sequelize_.query(sql, {transaction});
  }

  async addNewGenomes_(transaction) {
    const limit = this.seedConfig_.maxNewGenomesPerRun ?
      Math.max(0, this.seedConfig_.maxNewGenomesPerRun - this.numGenomesSeeded_) :
      null;

    const sql = `INSERT INTO ${this.models_.Genome.getTableName()} (${kTempTableFields.join(', ')})
SELECT a.*
FROM ${kTempTableName} a LEFT OUTER JOIN ${this.models_.Genome.getTableName()} b USING (accession, version)
WHERE b.accession is null
${limit ? 'LIMIT ' + limit : ''}
RETURNING *`;

    const [insertedRecords] = await this.sequelize_.query(sql, {transaction, raw: true});
    if (!insertedRecords.length) {
      return;
    }

    this.numGenomesSeeded_ += insertedRecords.length;
    const newGenomes = insertedRecords.map((genome) => ({
      id: genome.id,
      accession: genome.accession,
      version: genome.version,
      name: genome.name,
    }));
    this.logger_.info(newGenomes, `Inserted ${insertedRecords.length} genome records`);
  }

  truncateTemporaryTable_(transaction) {
    return this.sequelize_.query(`truncate table ${kTempTableName}`, {transaction});
  }

  dropTemporaryTable_() {
    return this.sequelize_.query(`drop table ${kTempTableName}`);
  }
};

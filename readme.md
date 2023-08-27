# MiST Projects

This repository houses several of the MiST projects as a **[monorepo](http://danluu.com/monorepo/)** (thus the vague moniker, "projects"). With the exception of directories beginning with an underscore or period (.) and the bin/ directory, each top-level folder represents a main project. Currently this repository contains the following projects:

* **Backend**
  * [core-lib](core-lib): core library containing generic functionality intended to be shared across multiple projects
  * [seqdepot-lib](seqdepot-lib/): set of modules powering SeqDepot
  * [mist-lib](mist-lib): set of modules powering the next generation of MiST
  * [mist-api](mist-api): RESTful API for interacting with the MiST database
  * [mist-pg-db](mist-pg-db): Docker setup for running PostgreSQL database
  * [mist-pipeline](mist-pipeline): distributed, computational pipeline for analyzing microbial genomes for signal transduction
* **Frontend**
  * [mist-web](https://github.com/ToshkaDev/mist-web-v): Angular powered front end web application for easily exploring the MiST database

Each of the above projects is independent from the others apart from explicit linking. For example, the *mist-pipeline* has symlinks to *core-lib*, *seqdepot-lib*, and *mist-lib*.

This structuring of our projects has made development signficantly easier without having to tediously deal with versioning issues and other build issues. The major pain point with this approach is having to write custom scripts for performing tasks that would be otherwise simple and straightforward with a repo per project. For example, if making a change to *mist-pipeline*, there is no need to re-run all the tests in parent or unrelated projects like *core-lib*.

## General Requirements
To effectively leverage and use the MiST projects, it is necessary to have the following tools:

* [git](https://git-scm.com/)
* [Node.js](https://nodejs.org) - we recommend using [NVM](https://github.com/creationix/nvm) to install version 8.x
* [Docker](https://www.docker.com/)
* [Docker Compose](https://docs.docker.com/compose/)

Node is used for various scripting tasks as well as other tooling helpers (e.g. [eslint](http://eslint.org/) javascript linting). The Docker software provides a reproducible and consistent environment for each project to cleanly express its own infrastructure. Thus, given the above tools, each project simply provides a Docker image or Dockerfile to configure the environment needed to run that project.

| After installing Docker, we recommend configuring docker to start up on boot.



## Setup
Clone the repository:
```bash
$ mkdir ~/mist
$ cd ~/mist
$ git clone https://github.com/bioliners/projects.git
$ cd projects
```

Checkout the develop branch:
```bash
$ git checkout develop
```

### Installing third party tools.

MiST3 so far uses 1 proprietary tool: [TMHMM2](https://services.healthtech.dtu.dk/service.php?TMHMM-2.0)

To be able to run the pipeline with `AseqCompute:tmhmm2` and build the TM predictions, we must go to the [TMHMM2](https://services.healthtech.dtu.dk/service.php?TMHMM-2.0) download page and sign up for download. They will send you an e-mail with a link. Follow the instructions below:

1) Click on the link TMHMM team sent you. It will take you to a "ftp style" download page with a LICENCE file and a `.tar.gz`.
2) Copy the link address to the `tar.gz` file.
3) Go to the root directory of the MiST3 project and find the file `docker-compose.yml`
4) Edit `docker-compose.yml` to include `TMHMM2_SECURE_URL` environmental variable in the section `biowonks-dev` - `environment`.
5) Paste the link address as the value of the variable. Save the file.

Example of how the insertion should look like:

```yml
  - TMHMM2_SECURE_URL=https://services.healthtech.dtu.dk/download/a742125a-c3b4-4622-93c2-b3ac77ec4fbe/tmhmm-2.0c.Linux.tar.gz
```
> Note that this link won't work in your case, you must get a link that works at the TMHMM Download page

### Setup and attach to the docker development environment

```
$ bin/setup-docker-dev.sh
$ docker attach biowonks-dev
```

This builds a base docker image including various dependencies and tools (e.g. Node.js, postgresql client libraries, etc.).


## Setting up and running specific projects
Most projects are written in Node.js and in general may be setup by navigating to the relevant top-level project folder (inside the docker container) and executing `yarn`. For details about each project, see each project's readme.

### MiST Pipeline
```bash
(biowonks @ docker) /app $ cd mist-pipeline
(biowonks @ docker) /app/mist-pipeline $ yarn
```

Run `pipeline.sh` without any arguments for help on how to use this command. For example, to seed new genomes, download each genomes taxonomy, and load this data from NCBI RefSeq:

```bash
(biowonks @ docker) /app/mist-pipeline $ bin/pipeline.sh SeedNewGenomes Taxonomy NCBICoreData
```

## MiST API
```bash
(biowonks @ docker) /app $ cd mist-api
(biowonks @ docker) /app/mist-api $ yarn
```

To start the API service:
```
(biowonks @ docker) /app/mist-api $ yarn start
```

Open `http://localhost:5000` to view the API documentation and ensure the API is running as expected.

To stop the API service:
```
(biowonks @ docker) /app/mist-api $ yarn stop
```

## Local PostgreSQL database access

From within the docker environment, run the following command:

```bash
(biowonks @ docker) /app $ psql -h mist-pg-db -U mist_dev mist_dev
```

When prompted for a password, use the password defined in `mist-lib/src/db/config.js`.

The postgresql database image is also accessible from the host environment (expose the postgresql image ports to the host environment):

```bash
$ psql -h localhost -U mist_dev mist_dev
```

| Tip: Rather than have to input the password everytime, you may also store your login credentials in a `.pgpass` [file](https://www.postgresql.org/docs/9.6/static/libpq-pgpass.html). This looks like the following (for the host environment): `localhost:5432:mist_dev:mist_dev:DATABASE_PASSWORD`. Be sure to set the permissions properly for this file too.

| Tip: Add an alias for the above psql command to your .bashrc: `alias psql-mist-dev="psql -h localhost -U mist_dev mist_dev`

